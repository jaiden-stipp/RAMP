import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadProject, compose, sha256 } from './protocol.js';
import { assertLocked, lockPath, stableJson } from './lockfile.js';
import { TaskStore } from './tasks.js';
import { HandoffStore } from './handoffs.js';
import { BudgetStore, sourceIdentity } from './budgets.js';
import { appendJournal, readJournal } from './journal.js';
import { effectiveProject } from './effective-project.js';
import { validateHandoffContext } from './handoff-context.js';

export class HostError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function requireHost(ok, code, message) { if (!ok) throw new HostError(code, message); }

// A mediation interface for an external framework, not a scheduler or model client.
export class ReferenceHost {
  constructor({ manifestPath, tools = {}, locked = false }) {
    this.manifestPath = manifestPath; this.directory = dirname(manifestPath); this.tools = tools; this.locked = locked;
    this.path = join(this.directory, '.ramp/host.jsonl'); this.active = new Map();
    for (const [name, tool] of Object.entries(tools)) {
      requireHost(typeof tool.execute === 'function' && typeof tool.validateInput === 'function' && typeof tool.capability === 'string' && Array.isArray(tool.resources) && tool.resources.length > 0 && Array.isArray(tool.phases) && tool.phases.length > 0, 'HOST_TOOL_CONFIG', `Tool ${name} requires explicit capability/resources/phases/input validation and handler`);
    }
    this.refresh();
  }
  refresh() {
    const base = loadProject(this.manifestPath);
    if (this.locked) assertLocked(base, lockPath(this.manifestPath));
    this.tasks = new TaskStore(join(this.directory, '.ramp/tasks.jsonl'), base, this.directory);
    const events = readJournal(this.tasks.path).map(r => r.payload);
    let effective;
    try { effective = effectiveProject(base, this.directory, events); }
    catch (error) { throw new HostError('HOST_CONFIG_CHANGED', error.message); }
    this.project = effective; this.tasks.project = effective;
    this.handoffs = new HandoffStore(this.tasks);
    this.budgets = new BudgetStore(join(this.directory, '.ramp/budgets.jsonl'), effective.manifest.project.id, effective.manifest.project.limits, effective.agents.map(a => a.id));
    const handoffHistory = this.handoffs.list();
    for (const id of handoffHistory.resumed) if (handoffHistory.contexts[id]) validateHandoffContext(handoffHistory.contexts[id], handoffHistory.checkpoints.find(c => c.id === id), this.directory);
    this.budgets.snapshot();
  }
  record(type, data) { appendJournal(this.path, { type, projectId: this.project.manifest.project.id, ...data }); }
  task(agentId, taskId) {
    const task = this.tasks.list().find(t => t.id === taskId);
    requireHost(task && task.owner === agentId, 'HOST_ASSIGNMENT', 'Requesting agent must own the task');
    return task;
  }
  assignment(agentId, taskId) {
    this.refresh(); const task = this.task(agentId, taskId);
    return { task, instructions: compose(this.project, agentId), budget: this.budgets.snapshot(), disposition: task.disposition };
  }
  generation(taskId) { return readJournal(this.tasks.path).filter(r => r.payload.taskId === taskId && r.payload.review?.outcome === 'changes_requested').length; }
  startCycle(agentId, taskId, cycleId) {
    requireHost(typeof cycleId === 'string' && !!cycleId.trim(), 'HOST_CYCLE', 'Cycle ID must be nonempty');
    this.refresh(); const task = this.task(agentId, taskId);
    requireHost(task.status === 'active' && ['gather', 'analyze'].includes(task.phase), 'HOST_GATE', 'Research cycles start in active gather/analyze work');
    const generation = this.generation(taskId);
    requireHost(!readJournal(this.path).some(r => r.payload.type === 'cycle-start' && r.payload.taskId === taskId && r.payload.generation === generation), 'HOST_CYCLE', 'A cycle is already recorded for this work generation');
    const token = this.budgets.reserve('iterations', `${taskId}:${cycleId}`, agentId, 'Start research cycle');
    this.budgets.begin(token, agentId); this.budgets.finish(token, agentId);
    this.record('cycle-start', { taskId, agentId, cycleId, generation });
    return this.budgets.snapshot();
  }
  transition(agentId, taskId, change, reason) {
    this.refresh(); this.task(agentId, taskId);
    requireHost(change && !['type', 'taskId', 'projectId', 'actor', 'reason', 'handoffId', 'owner'].some(k => Object.hasOwn(change, k)), 'HOST_EVENT', 'Transition accepts state/gate data only; use checkpoint resume for ownership');
    return this.tasks.submit({ ...change, type: 'transition', taskId, actor: agentId, reason });
  }
  checkpoint(agentId, input) { this.refresh(); this.task(agentId, input.taskId); return this.handoffs.create({ ...input, fromAgent: agentId }, agentId); }
  resume(checkpointId, actor = 'operator') { this.refresh(); const result = this.handoffs.resume(checkpointId, actor); this.refresh(); return result; }
  cancel(agentId, taskId, reason) {
    this.refresh(); this.task(agentId, taskId);
    this.tasks.submit({ type: 'transition', taskId, status: 'cancelled', actor: agentId, reason });
    for (const request of this.active.values()) if (request.taskId === taskId) request.controller.abort(new HostError('HOST_CANCELLED', reason));
    this.record('cancelled', { taskId, agentId, reason });
  }
  async requestTool({ agentId, taskId, tool: name, resource, input = {}, signal }) {
    input = structuredClone(input);
    this.refresh();
    const task = this.task(agentId, taskId); const tool = this.tools[name];
    const agent = this.project.agents.find(a => a.id === agentId);
    requireHost(tool && agent, 'HOST_TOOL_DENIED', 'Unknown or unconfigured tool/agent');
    const capabilities = new Set(agent.modules.flatMap(m => m.capabilities));
    requireHost(capabilities.has(tool.capability) && this.project.manifest.project.allowedCapabilities.includes(tool.capability), 'HOST_CAPABILITY', 'Tool capability is not declared by this assignment within its charter');
    requireHost(tool.resources.includes(resource), 'HOST_SCOPE', 'Resource/destination is outside the host allowlist');
    requireHost(['active', 'in_review'].includes(task.status) && tool.phases.includes(task.phase), 'HOST_GATE', 'Task status/phase does not permit this tool');
    requireHost(tool.validateInput(input) === true, 'HOST_INPUT', 'Tool input violates its host contract');
    signal?.throwIfAborted();
    const generation = this.generation(taskId);
    if (tool.capability === 'source.read') {
      requireHost(['gather', 'analyze', 'review'].includes(task.phase), 'HOST_GATE', 'Source access requires a research/review phase');
      if (task.phase === 'review') {
        requireHost(this.budgets.snapshot().reservations.some(r => r.kind === 'sources' && r.key === sourceIdentity(resource) && r.status === 'committed'), 'HOST_GATE', 'Review can revisit recorded sources; new acquisition needs a research phase/cycle');
      } else requireHost(readJournal(this.path).some(r => r.payload.type === 'cycle-start' && r.payload.taskId === taskId && r.payload.generation === generation), 'HOST_CYCLE', 'Start a budgeted research cycle before source acquisition');
    }
    const controller = new AbortController(); const combined = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
    const requestId = randomUUID();
    this.active.set(requestId, { taskId, controller });
    let token; let started = false;
    try {
      if (tool.capability === 'source.read') token = this.budgets.reserve('sources', resource, agentId, `Tool ${name}`);
      combined.throwIfAborted();
      this.record('tool-start', { taskId, agentId, tool: name, resource, inputHash: sha256(stableJson(input)) });
      if (token) { this.budgets.begin(token, agentId); started = true; }
      const result = await tool.execute({ resource, input, signal: combined });
      combined.throwIfAborted();
      if (token) this.budgets.finish(token, agentId);
      token = null;
      this.record('tool-finish', { taskId, agentId, tool: name, resource, outcome: 'succeeded', resultHash: sha256(stableJson(result ?? null)) });
      return { result, budget: this.budgets.snapshot() };
    } catch (error) {
      if (token) {
        if (started) this.budgets.finish(token, agentId, combined.aborted ? 'cancelled' : 'failed');
        else this.budgets.cancel(token, agentId);
      }
      this.record('tool-finish', { taskId, agentId, tool: name, resource, outcome: combined.aborted ? 'cancelled' : 'failed', code: error.code ?? 'TOOL_FAILURE' });
      throw error;
    } finally { this.active.delete(requestId); }
  }
  status() { this.refresh(); return { projectId: this.project.manifest.project.id, tasks: this.tasks.list(), budget: this.budgets.snapshot(), events: readJournal(this.path).map(r => r.payload) }; }
}
