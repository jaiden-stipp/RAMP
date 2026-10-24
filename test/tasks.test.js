import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeProject } from '../src/scaffold.js';
import { loadProject } from '../src/protocol.js';
import { TaskStore, PHASES } from '../src/tasks.js';
import { readJournal } from '../src/journal.js';

export function setupTasks() {
  const dir = join(mkdtempSync(join(tmpdir(), 'ramp-tasks-')), 'project'); initializeProject(dir);
  const project = loadProject(join(dir, 'ramp.json')); const path = join(dir, '.ramp/tasks.jsonl');
  const store = new TaskStore(path, project, dir);
  const task = { id: 'T-1', owner: 'scout', phase: 'scope', question: 'Test question', inputs: [], expectedOutput: 'Cited brief', acceptanceCriteria: ['Citations checked'], status: 'planned', evidenceIds: [], artifacts: [], reopenedFrom: null };
  const create = () => store.submit({ type: 'create', task, actor: 'operator', reason: 'Create test task' });
  const transition = change => store.submit({ type: 'transition', taskId: 'T-1', actor: 'operator', reason: 'Recorded work', ...change });
  const artifact = kind => { writeFileSync(join(dir, `${kind}.md`), `Test ${kind} artifact`); return { path: `${kind}.md`, kind }; };
  return { dir, project, path, store, task, create, transition, artifact };
}
test('full lifecycle preserves failed review, blocked work, acceptance, and immutable completed task', () => {
  const f = setupTasks(); f.create(); f.transition({ status: 'active' });
  assert.throws(() => f.transition({ phase: 'plan' }), /Missing charter/);
  f.transition({ status: 'blocked', blocker: 'Missing source', unblockCondition: 'Source arrives' });
  assert.throws(() => f.transition({ status: 'active' }), /resolution/);
  f.transition({ status: 'active', resolution: 'Source supplied' });
  for (const [phase, kind] of [['plan', 'charter'], ['gather', 'plan'], ['analyze', 'evidence']]) f.transition({ phase, artifacts: [f.artifact(kind)] });
  f.transition({ status: 'in_review', phase: 'review', artifacts: [f.artifact('analysis')] });
  f.transition({ status: 'active', phase: 'analyze', artifacts: [f.artifact('review')], review: { outcome: 'changes_requested', reviewer: 'reviewer', selfReview: false, issues: ['Missing locator'] } });
  f.transition({ status: 'in_review', phase: 'review', artifacts: [f.artifact('analysis')] });
  f.transition({ phase: 'synthesize', artifacts: [f.artifact('review')], review: { outcome: 'approved', reviewer: 'reviewer', selfReview: false, issues: [] } });
  f.transition({ phase: 'deliver', artifacts: [f.artifact('brief')] });
  assert.throws(() => f.transition({ status: 'done', artifacts: [f.artifact('delivery')] }), /acceptance/);
  f.transition({ status: 'done', artifacts: [f.artifact('delivery')], acceptedCriteria: ['Citations checked'], disposition: 'complete' });
  assert.equal(new TaskStore(f.path, f.project, f.dir).list()[0].status, 'done');
  assert.throws(() => f.transition({ status: 'active' }), /Terminal task/);
  f.store.submit({ type: 'create', task: { ...f.task, id: 'T-2', reopenedFrom: 'T-1' }, actor: 'operator', reason: 'New evidence' });
  assert.equal(f.store.list().length, 2);
  assert.ok(readJournal(f.path).some(r => r.payload.review?.outcome === 'changes_requested'));
});
test('invalid state/gate changes and malformed history fail without appending', () => {
  const f = setupTasks(); f.create(); const original = readFileSync(f.path, 'utf8');
  assert.throws(() => f.transition({ status: 'done' }), /Invalid task transition/);
  assert.throws(() => f.transition({ status: 'blocked' }), /Invalid task transition/);
  assert.equal(readFileSync(f.path, 'utf8'), original);
  f.transition({ status: 'active' });
  assert.throws(() => f.transition({ status: 'blocked' }), /blocker and unblock/);
  assert.throws(() => f.transition({ phase: 'gather' }), /one gate/);
  assert.throws(() => f.transition({ artifacts: [{ path: '../escape', kind: 'plan' }] }));
  f.transition({ status: 'cancelled' });
  assert.throws(() => f.transition({ status: 'active' }), /Terminal/);
  const journal = readFileSync(f.path, 'utf8'); writeFileSync(f.path, journal.replace('Recorded work', 'tampered'));
  assert.throws(() => f.store.list(), /Invalid journal chain/);
});
