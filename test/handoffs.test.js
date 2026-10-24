import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeProject } from '../src/scaffold.js';
import { loadProject } from '../src/protocol.js';
import { TaskStore } from '../src/tasks.js';
import { HandoffStore } from '../src/handoffs.js';
import { readJournal } from '../src/journal.js';

function fixture() {
  const dir = join(mkdtempSync(join(tmpdir(), 'ramp-handoff-')), 'project'); initializeProject(dir);
  const project = loadProject(join(dir, 'ramp.json')); const tasks = new TaskStore(join(dir, '.ramp/tasks.jsonl'), project, dir);
  const task = { id: 'T-1', owner: 'scout', phase: 'scope', question: 'Synthetic exercise', inputs: [], expectedOutput: 'Analysis', acceptanceCriteria: ['Review evidence'], status: 'planned', evidenceIds: [], artifacts: [], reopenedFrom: null };
  tasks.submit({ type: 'create', actor: 'operator', reason: 'Test', task }); tasks.submit({ type: 'transition', taskId: task.id, status: 'active', actor: 'operator', reason: 'Test' });
  const evidence = JSON.parse(readFileSync(new URL('../examples/evidence/synthetic.json', import.meta.url), 'utf8')); evidence.projectId = project.manifest.project.id;
  writeFileSync(join(dir, 'evidence.json'), JSON.stringify(evidence));
  const request = { taskId: task.id, fromAgent: 'scout', toAgent: 'analyst', completedWork: ['Gathered synthetic fixtures'], openQuestions: ['Which source is independent?'], nextAction: 'Analyze evidence', conclusion: 'No real finding', uncertainty: 'Synthetic fixture only', budgetUsage: { sources: 2, iterations: 1 }, evidenceFile: 'evidence.json', evidenceIds: ['E-001', 'E-002'], sameUnderlyingAgent: true };
  return { dir, tasks, store: new HandoffStore(tasks), request, evidence };
}
test('scout-to-analyst checkpoint restores sources/questions/provenance and records immutable persona swaps', () => {
  const f = fixture(); const original = readFileSync(join(f.dir, 'evidence.json'), 'utf8');
  const checkpoint = f.store.create({ ...f.request, modules: ['roles/analyst', 'methods/evidence-first', 'personas/calm-guide'] });
  const preview = f.store.preview(checkpoint.id);
  assert.ok(preview.instructions.includes('Which source is independent?'));
  assert.ok(preview.instructions.includes('E-001'));
  assert.ok(preview.instructions.includes(checkpoint.sourceLock.manifestHash));
  assert.match(preview.disclosure, /self-review/);
  f.store.resume(checkpoint.id);
  assert.equal(f.tasks.list()[0].owner, 'analyst');
  assert.throws(() => f.store.resume(checkpoint.id), /already resumed/);
  assert.equal(readFileSync(join(f.dir, 'evidence.json'), 'utf8'), original);
  assert.deepEqual(f.store.list().checkpoints[0].evidence, f.evidence);
});
test('invalid references, wrong project/task, incompatible swaps, changed inputs, and invalid permissions are rejected with audit records', () => {
  for (const change of [{ taskId: 'wrong' }, { evidenceIds: ['absent'] }, { modules: ['roles/analyst'] }, { modules: ['roles/scout', 'roles/analyst', 'methods/evidence-first'] }]) {
    const f = fixture(); assert.throws(() => f.store.create({ ...f.request, ...change }));
    assert.ok(readJournal(f.tasks.path).some(r => r.payload.operation === 'rejected'));
  }
  const f = fixture(); f.evidence.projectId = 'wrong'; writeFileSync(join(f.dir, 'evidence.json'), JSON.stringify(f.evidence)); assert.throws(() => f.store.create(f.request), /wrong project/);
  const g = fixture(); const cp = g.store.create(g.request); writeFileSync(join(g.dir, 'evidence.json'), '{}'); assert.throws(() => g.store.preview(cp.id), /Evidence changed/);
  const h = fixture(); h.tasks.project.manifest.project.allowedCapabilities = ['source.read']; assert.throws(() => h.store.create(h.request), /forbidden capability/);
});
