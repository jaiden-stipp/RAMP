import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { initializeProject } from '../src/scaffold.js';
import { REPO_ROOT } from '../src/protocol.js';

test('guided CLI lifecycle, failed review rollback and handoff need no event JSON and preserve gates', t => {
  const parent = mkdtempSync(join(tmpdir(), 'ramp guided ')); t.after(() => rmSync(parent, { recursive: true, force: true }));
  const dir = join(parent, 'manual project'); initializeProject(dir); const path = join(dir, 'ramp.json');
  const call = (group, verb, ...args) => spawnSync(process.execPath, [join(REPO_ROOT, 'src/cli.js'), group, verb, path, ...args], { cwd: dir, encoding: 'utf8' });
  const run = (...args) => { const r = call(...args); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).result; };
  const task = (verb, ...args) => run('task', verb, '--id', 'T-1', ...args);
  const artifact = name => { writeFileSync(join(dir, `${name}.md`), `Synthetic ${name}`); return `${name}.md`; };
  run('task', 'create', '--id', 'T-1', '--owner', 'scout', '--question', 'Synthetic walkthrough', '--output', 'Report', '--criterion', 'Limits disclosed');
  const journal = () => readFileSync(join(dir, '.ramp/tasks.jsonl'), 'utf8');
  const before = journal(); task('activate', '--dry-run'); assert.equal(journal(), before);
  task('activate'); const active = journal();
  assert.equal(call('task', 'advance', '--id', 'T-1', '--phase', 'gather', '--artifact', artifact('charter')).status, 1); assert.equal(journal(), active);
  assert.equal(call('task', 'activate', '--id', 'T-1', '--owner', 'reviewer').status, 1);
  assert.equal(call('task', 'block', '--id', 'T-1', '--actor', 'reviewer', '--blocker', 'Wait', '--until', 'Source arrives').status, 1);
  task('block', '--blocker', 'Need source', '--until', 'Source arrives');
  assert.equal(call('task', 'activate', '--id', 'T-1').status, 1); task('activate', '--resolution', 'Source supplied');
  assert.equal(task('inspect').requiredGate, 'charter');
  for (const kind of ['charter', 'plan', 'evidence']) task('advance', '--artifact', artifact(kind));
  writeFileSync(join(dir, 'evidence.json'), JSON.stringify({ artifactVersion: '0.1.0', projectId: JSON.parse(readFileSync(path, 'utf8')).project.id, synthetic: true, evidence: [], claims: [] }));
  const cp = run('checkpoint', 'prepare', '--task', 'T-1', '--from', 'scout', '--to', 'analyst', '--evidence', 'evidence.json', '--completed', 'Prepared fixtures', '--next', 'Review', '--conclusion', 'No real finding', '--uncertainty', 'Synthetic only', '--question', 'Unmeasured', '--same-agent', '--module', 'roles/analyst', '--module', 'methods/evidence-first', '--module', 'personas/teaching-guide');
  assert.match(run('checkpoint', 'preview', '--id', cp.id, '--json').instructions, /teaching-guide/);
  run('checkpoint', 'resume', '--id', cp.id, '--json');
  task('advance', '--actor', 'analyst', '--artifact', artifact('analysis'));
  task('review', '--reviewer', 'reviewer', '--actor', 'reviewer', '--outcome', 'changes_requested', '--issue', 'Missing limitations', '--artifact', artifact('failed-review'));
  assert.equal(task('inspect').task.phase, 'analyze');
  task('advance', '--artifact', 'analysis.md');
  task('review', '--reviewer', 'reviewer', '--outcome', 'approved', '--artifact', artifact('review'));
  task('advance', '--artifact', artifact('brief'));
  assert.equal(call('task', 'complete', '--id', 'T-1', '--artifact', artifact('delivery'), '--disposition', 'partial').status, 1);
  task('complete', '--artifact', 'delivery.md', '--criterion', 'Limits disclosed', '--disposition', 'partial');
  assert.equal(task('inspect').task.status, 'done');
  assert.equal(call('task', 'activate', '--id', 'T-1').status, 1);
  const legacy = spawnSync(process.execPath, [join(REPO_ROOT, 'src/cli.js'), 'tasks', path], { encoding: 'utf8' }); assert.equal(legacy.status, 0); assert.equal(JSON.parse(legacy.stdout)[0].disposition, 'partial');
});

test('every guided operation has contextual help and actionable missing-option failures', () => {
  for (const [group, verbs] of [['task', ['create', 'inspect', 'activate', 'block', 'advance', 'review', 'complete', 'cancel']], ['checkpoint', ['prepare', 'preview', 'resume']]]) {
    for (const verb of verbs) {
      const r = spawnSync(process.execPath, [join(REPO_ROOT, 'src/cli.js'), group, verb, '--help'], { encoding: 'utf8' });
      assert.equal(r.status, 0); assert.match(r.stdout, /Usage: ramp/); assert.match(r.stdout, /--/);
    }
  }
});
