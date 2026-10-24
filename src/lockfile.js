import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { PROTOCOL_VERSION, readJson, sha256 } from './protocol.js';
import { DiagnosticError, diagnostic } from './validation.js';

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function configurationLock(project) {
  const modules = [...new Map(project.agents.flatMap(agent => agent.modules.map(m => [m.id, m]))).values()].sort((a, b) => a.id.localeCompare(b.id));
  return {
    lockVersion: 1, protocolVersion: PROTOCOL_VERSION, hashPolicy: 'sha256-utf8-bomless-lf-v1',
    manifestHash: project.manifestHash, coreHash: project.coreHash,
    agents: project.agents.map(a => ({ id: a.id, modules: a.modules.map(m => m.id) })),
    modules: modules.map(m => ({ id: m.id, version: m.version, origin: m.origin, hash: m.hash,
      fields: Object.fromEntries(['instructions', 'summary', 'requires', 'excludes', 'capabilities'].map(field => [field, sha256(stableJson(m[field]))])) }))
  };
}

export function lockPath(manifestPath) { return join(dirname(manifestPath), 'ramp.lock.json'); }

export function compareLock(previous, project) {
  const current = configurationLock(project);
  const changes = [];
  if (previous.lockVersion !== 1 || previous.protocolVersion !== PROTOCOL_VERSION || previous.hashPolicy !== current.hashPolicy) changes.push({ kind: 'format', message: 'Lock format/protocol/hash policy differs' });
  for (const field of ['manifestHash', 'coreHash', 'agents']) {
    if (stableJson(previous[field]) !== stableJson(current[field])) changes.push({ kind: field, before: previous[field] ?? null, after: current[field] });
  }
  const priorModules = Array.isArray(previous.modules) ? previous.modules : [];
  const before = new Map(priorModules.map(m => [m.id, m]));
  const after = new Map(current.modules.map(m => [m.id, m]));
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (!before.has(id) || !after.has(id)) changes.push({ kind: after.has(id) ? 'module-added' : 'module-removed', id });
    else if (stableJson(before.get(id)) !== stableJson(after.get(id))) {
      const old = before.get(id); const next = after.get(id);
      const fields = ['instructions', 'summary', 'requires', 'excludes', 'capabilities'].filter(field => old.fields?.[field] !== next.fields[field]);
      const module = project.agents.flatMap(a => a.modules).find(m => m.id === id);
      changes.push({ kind: 'module-changed', id, before: old, after: next, changedFields: fields, currentValues: Object.fromEntries(fields.map(field => [field, module[field]])) });
    }
  }
  // Unknown/missing lock fields must also invalidate locked mode.
  if (!changes.length && stableJson(previous) !== stableJson(current)) changes.push({ kind: 'format', message: 'Lock contains unexpected or missing fields' });
  return changes;
}

export function assertLocked(project, path) {
  const changes = compareLock(readJson(path).value, project);
  if (changes.length) throw new DiagnosticError([diagnostic('LOCK_MISMATCH', `Configuration differs from lock (${changes.map(c => c.kind + (c.id ? `: ${c.id}` : '')).join(', ')}). Inspect with diff; refresh explicitly with lock --update.`, path)]);
}

export function writeLock(project, path, update = false) {
  const next = configurationLock(project);
  const contents = `${JSON.stringify(next, null, 2)}\n`;
  if (!update) { writeFileSync(path, contents, { encoding: 'utf8', flag: 'wx' }); return [{ kind: 'lock-created' }]; }
  const changes = compareLock(readJson(path).value, project);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, contents, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporary, path);
  } finally { try { unlinkSync(temporary); } catch {} }
  return changes;
}
