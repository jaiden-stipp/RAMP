import { randomUUID } from 'node:crypto';
import { appendJournal, readJournal } from './journal.js';
import { stableJson } from './lockfile.js';

export class BudgetError extends Error {
  constructor(kind, remaining, message = 'Budget exhausted') {
    super(`${message}: ${kind}; remaining allowance ${remaining}`); this.code = 'BUDGET_EXHAUSTED'; this.kind = kind; this.remaining = remaining;
  }
}
export function sourceIdentity(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Source key must be nonempty');
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value); if (url.username || url.password) throw new Error('Source keys must not contain credentials');
    url.hash = ''; return url.href;
  }
  return value.trim().replaceAll('\\', '/');
}

export class BudgetStore {
  constructor(path, projectId, limits, agentIds = []) {
    if (!['maxSources', 'maxIterations'].every(k => Number.isSafeInteger(limits[k]) && limits[k] > 0)) throw new Error('Invalid budget limits');
    this.path = path; this.projectId = projectId; this.limits = limits; this.agentIds = agentIds;
  }
  replay(events) {
    const tokens = new Map(); const consumed = { sources: 0, iterations: 0 }; const held = { sources: 0, iterations: 0 };
    const sources = new Set(); const iterations = new Set();
    for (const event of events) {
      if (event.projectId !== this.projectId || stableJson(event.limits) !== stableJson(this.limits)) throw new Error('Budget ledger project/limits mismatch; counters cannot be reset by changing configuration');
      if (typeof event.token !== 'string' || !event.token.trim() || typeof event.agent !== 'string' || !event.agent.trim() || typeof event.reason !== 'string' || !event.reason.trim() || (this.agentIds.length && event.agent !== 'operator' && !this.agentIds.includes(event.agent))) throw new Error('Budget event requires a token, known agent, and reason');
      if (event.type === 'reserve') {
        if (!['sources', 'iterations'].includes(event.kind) || typeof event.key !== 'string' || !event.key.trim() || tokens.has(event.token)) throw new Error('Invalid budget reservation');
        const completed = event.kind === 'sources' ? sources : iterations;
        const duplicates = [...tokens.values()].some(t => t.kind === event.kind && t.key === event.key && ['reserved', 'started'].includes(t.status));
        if (duplicates || (event.kind === 'iterations' && completed.has(event.key))) throw new BudgetError(event.kind, this.limit(event.kind) - consumed[event.kind] - held[event.kind], 'Source/cycle already reserved or iteration already counted');
        const charge = completed.has(event.key) ? 0 : 1;
        const remaining = this.limit(event.kind) - consumed[event.kind] - held[event.kind];
        if (charge && remaining < 1) throw new BudgetError(event.kind, remaining);
        held[event.kind] += charge; tokens.set(event.token, { ...event, charge, status: 'reserved' });
      } else {
        const token = tokens.get(event.token);
        if (!token || token.agent !== event.agent || !['reserved', 'started'].includes(token.status)) throw new Error('Unknown, finished, or differently owned budget token');
        if (event.type === 'begin') {
          if (token.status !== 'reserved') throw new Error('Budget operation already started'); token.status = 'started';
        } else if (event.type === 'cancel' && token.status === 'reserved') {
          token.status = 'released'; held[token.kind] -= token.charge;
        } else if (event.type === 'finish' || event.type === 'cancel') {
          if (token.status !== 'started' || (event.type === 'finish' && !['succeeded', 'failed', 'cancelled'].includes(event.outcome))) throw new Error('Finish requires a started operation and recognized outcome');
          token.status = 'committed'; token.outcome = event.type === 'cancel' ? 'cancelled' : event.outcome;
          held[token.kind] -= token.charge; consumed[token.kind] += token.charge;
          (token.kind === 'sources' ? sources : iterations).add(token.key);
        } else throw new Error('Unknown budget event');
      }
    }
    return { tokens, consumed, held };
  }
  limit(kind) { return kind === 'sources' ? this.limits.maxSources : this.limits.maxIterations; }
  snapshot() {
    const state = this.replay(readJournal(this.path).map(r => r.payload));
    return { projectId: this.projectId, limits: this.limits, consumed: state.consumed, reserved: state.held,
      remaining: Object.fromEntries(['sources', 'iterations'].map(kind => [kind, this.limit(kind) - state.consumed[kind] - state.held[kind]])),
      reservations: [...state.tokens.values()].map(({ token, kind, key, agent, status, charge, outcome }) => ({ token, kind, key, agent, status, charge, ...(outcome ? { outcome } : {}) })) };
  }
  submit(input) {
    const event = { ...input, projectId: this.projectId, limits: this.limits };
    if (event.type === 'reserve' && event.kind === 'sources') event.key = sourceIdentity(event.key);
    appendJournal(this.path, event, events => this.replay(events)); return event;
  }
  reserve(kind, key, agent, reason) {
    const token = randomUUID(); this.submit({ type: 'reserve', token, kind, key: kind === 'sources' ? sourceIdentity(key) : key, agent, reason }); return token;
  }
  begin(token, agent, reason = 'Start budgeted operation') { this.submit({ type: 'begin', token, agent, reason }); }
  finish(token, agent, outcome = 'succeeded', reason = 'Commit budgeted operation') { this.submit({ type: 'finish', token, agent, outcome, reason }); }
  cancel(token, agent, reason = 'Cancel budgeted operation') { this.submit({ type: 'cancel', token, agent, reason }); }
}
