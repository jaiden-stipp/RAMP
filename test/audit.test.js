import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { initializeProject } from '../src/scaffold.js';
import { REPO_ROOT, loadProject, sha256 } from '../src/protocol.js';
import { writeLock } from '../src/lockfile.js';
import { TaskStore } from '../src/tasks.js';
import { HandoffStore } from '../src/handoffs.js';
import { BudgetStore } from '../src/budgets.js';
import { projectReport, reportMarkdown } from '../src/audit.js';

function fixture(t, progress = false) {
  const parent = mkdtempSync(join(tmpdir(), 'ramp audit ')); t.after(() => rmSync(parent, { recursive: true, force: true }));
  const dir = join(parent, 'project'); initializeProject(dir); const path = join(dir, 'ramp.json');
  if (!progress) return { dir, path };
  const manifest = JSON.parse(readFileSync(path)); manifest.project.limits.maxSources = 1; writeFileSync(path, JSON.stringify(manifest)); const project = loadProject(path); writeLock(project, join(dir, 'ramp.lock.json'));
  const tasks = new TaskStore(join(dir, '.ramp/tasks.jsonl'), project, dir);
  const task = { id: 'T-1', owner: 'scout', phase: 'scope', question: 'Synthetic audit', expectedOutput: 'Report', acceptanceCriteria: ['Disclose gaps'], status: 'planned', inputs: [], artifacts: [], evidenceIds: [], reopenedFrom: null };
  tasks.submit({ type: 'create', actor: 'operator', reason: 'Test', task }); tasks.submit({ type: 'transition', taskId: task.id, status: 'active', actor: 'operator', reason: 'Start' });
  writeFileSync(join(dir, 'evidence.json'), JSON.stringify({ artifactVersion: '0.1.0', projectId: manifest.project.id, synthetic: true, evidence: [], claims: [] }));
  new HandoffStore(tasks).create({ taskId: task.id, fromAgent: 'scout', toAgent: 'analyst', evidenceFile: 'evidence.json', evidenceIds: [], completedWork: ['Synthetic only'], openQuestions: ['No support reviewed'], nextAction: 'Analyze', conclusion: 'No finding', uncertainty: 'Unknown', budgetUsage: { sources: 0, iterations: 0 }, sameUnderlyingAgent: true });
  tasks.submit({ type: 'transition', taskId: task.id, status: 'blocked', blocker: 'Missing source', unblockCondition: 'Source supplied', actor: 'operator', reason: 'Wait' });
  const budget = new BudgetStore(join(dir, '.ramp/budgets.jsonl'), manifest.project.id, manifest.project.limits, project.agents.map(a => a.id)); const token = budget.reserve('sources', 'fixture:source', 'scout', 'Test'); budget.begin(token, 'scout'); budget.finish(token, 'scout');
  return { dir, path, tasks, task };
}
function snapshot(dir) {
  const result = {};
  function visit(path) { for (const entry of readdirSync(path, { withFileTypes: true })) { const next = join(path, entry.name); if (entry.isDirectory()) visit(next); else result[next] = sha256(readFileSync(next)); } }
  visit(dir); return result;
}
test('fresh and progressed status are useful, distinguish not checked, and never mutate records', t => {
  const fresh = fixture(t); const before = snapshot(fresh.dir); const report = projectReport(fresh.path);
  assert.equal(report.integrityPassed, true); assert.equal(report.sections.lock.status, 'not_checked'); assert.equal(report.sections.evidence.status, 'not_checked'); assert.deepEqual(snapshot(fresh.dir), before);
  const f = fixture(t, true); const prior = snapshot(f.dir); const progressed = projectReport(f.path);
  assert.equal(progressed.integrityPassed, true); assert.equal(progressed.sections.tasks.items[0].status, 'blocked'); assert.equal(progressed.sections.budgets.remaining.sources, 0);
  for (const code of ['TASK_BLOCKED', 'NEXT_GATE', 'CHECKPOINT_STALE', 'BUDGET_EXHAUSTED']) assert.ok(progressed.actions.some(a => a.code === code));
  assert.equal(progressed.sections.sourceSupport.status, 'not_checked'); assert.match(reportMarkdown(progressed), /No sources or models were called/); assert.deepEqual(snapshot(f.dir), prior);
});
test('audit detects stale locks, missing checkpoint artifacts and task evidence references with nonzero JSON exit', t => {
  const f = fixture(t, true); const manifest = JSON.parse(readFileSync(f.path)); manifest.project.title += ' changed'; writeFileSync(f.path, JSON.stringify(manifest));
  assert.equal(projectReport(f.path).sections.lock.status, 'failed');
  const g = fixture(t, true); unlinkSync(join(g.dir, 'evidence.json'));
  const missing = projectReport(g.path); assert.equal(missing.sections.checkpoints.status, 'failed'); assert.equal(missing.sections.evidence.status, 'failed');
  const h = fixture(t, true); h.tasks.submit({ type: 'create', task: { ...h.task, id: 'T-2', evidenceIds: ['absent'] }, actor: 'operator', reason: 'Inject missing reference' });
  const cli = spawnSync(process.execPath, [join(REPO_ROOT, 'src/cli.js'), 'audit', h.path, '--json'], { encoding: 'utf8' }); assert.equal(cli.status, 1);
  const report = JSON.parse(cli.stdout); assert.equal(report.sections.evidence.status, 'failed'); assert.ok(report.sections.evidence.diagnostics.some(d => d.code === 'TASK_EVIDENCE_REFERENCE' && d.path.includes('evidenceIds')));
  const previous = snapshot(h.dir); projectReport(h.path, '../outside.json'); assert.deepEqual(snapshot(h.dir), previous);
});
