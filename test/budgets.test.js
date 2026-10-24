import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { BudgetStore, sourceIdentity } from '../src/budgets.js';
import { initializeProject } from '../src/scaffold.js';
import { loadProject } from '../src/protocol.js';
import { TaskStore } from '../src/tasks.js';
import { HandoffStore } from '../src/handoffs.js';
const fresh = (sources = 2, iterations = 2) => new BudgetStore(join(mkdtempSync(join(tmpdir(), 'ramp-budget-')), 'budget.jsonl'), 'project', { maxSources: sources, maxIterations: iterations }, ['scout', 'analyst']);
const spend = (b, kind, key, agent = 'scout', outcome = 'succeeded') => { const token = b.reserve(kind, key, agent, 'Research operation'); b.begin(token, agent); b.finish(token, agent, outcome); return token; };
test('source/iteration counts persist across agents and failed/repeated/cancelled operations follow policy', () => {
  const b = fresh(); spend(b, 'sources', 'https://example.org/doc#first');
  spend(b, 'sources', 'https://EXAMPLE.ORG:443/doc#second', 'analyst', 'failed');
  assert.equal(b.snapshot().consumed.sources, 1);
  let t = b.reserve('sources', 'local:cancel-before-start', 'scout', 'Cancelled'); b.cancel(t, 'scout');
  assert.equal(b.snapshot().reserved.sources, 0);
  t = b.reserve('sources', 'local:cancel-after-start', 'analyst', 'Cancelled'); b.begin(t, 'analyst'); b.cancel(t, 'analyst');
  assert.equal(b.snapshot().consumed.sources, 2);
  assert.throws(() => b.reserve('sources', 'new', 'scout', 'Too many'), e => e.code === 'BUDGET_EXHAUSTED' && e.kind === 'sources' && e.remaining === 0);
  spend(b, 'iterations', 'initial-cycle'); spend(b, 'iterations', 'review-rework', 'analyst', 'failed');
  assert.throws(() => b.reserve('iterations', 'extra-cycle', 'scout', 'Too many'), /iterations.*remaining allowance 0/);
  assert.deepEqual(new BudgetStore(b.path, b.projectId, b.limits, ['scout', 'analyst']).snapshot().consumed, { sources: 2, iterations: 2 });
  spend(b, 'sources', 'https://example.org/doc', 'analyst'); // Existing source review still possible at the ceiling.
  assert.equal(b.snapshot().consumed.sources, 2);
  assert.throws(() => new BudgetStore(b.path, b.projectId, { maxSources: 10, maxIterations: 2 }).snapshot(), /limits mismatch/);
  assert.throws(() => sourceIdentity('https://user:secret@example.org'), /credentials/);
});
test('four concurrent processes cannot reserve the same final source allowance', async () => {
  const b = fresh(1, 1); const module = new URL('../src/budgets.js', import.meta.url).href;
  const code = `import { BudgetStore } from ${JSON.stringify(module)}; const b = new BudgetStore(process.argv[1], 'project', {maxSources:1,maxIterations:1}); try { b.reserve('sources', process.argv[2], 'scout', 'Concurrent test'); console.log('reserved'); } catch(e) { console.log('rejected'); }`;
  const results = await Promise.all([0, 1, 2, 3].map(i => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, b.path, `source-${i}`]); let output = ''; let errors = '';
    child.stdout.on('data', data => output += data); child.stderr.on('data', data => errors += data); child.on('error', reject); child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(errors)));
  })));
  assert.equal(results.filter(r => r === 'reserved').length, 1);
  assert.equal(b.snapshot().reserved.sources, 1);
});
test('exhausted projects can hand off, swap personas, and deliver partial results without resetting counts', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ramp-budget-handoff-')), 'project'); initializeProject(dir);
  const file = join(dir, 'ramp.json'); const m = JSON.parse(readFileSync(file, 'utf8')); m.project.limits = { maxSources: 1, maxIterations: 1 }; writeFileSync(file, JSON.stringify(m));
  const project = loadProject(file); const budget = new BudgetStore(join(dir, '.ramp/budgets.jsonl'), m.project.id, m.project.limits);
  spend(budget, 'sources', 'synthetic:one'); spend(budget, 'iterations', 'initial');
  const tasks = new TaskStore(join(dir, '.ramp/tasks.jsonl'), project, dir);
  const task = { id: 'T-partial', owner: 'scout', phase: 'scope', question: 'Report remaining gaps', inputs: [], expectedOutput: 'Partial brief', acceptanceCriteria: ['Disclose gaps'], status: 'planned', evidenceIds: [], artifacts: [], reopenedFrom: null };
  tasks.submit({ type: 'create', actor: 'operator', reason: 'Start', task });
  tasks.submit({ type: 'transition', taskId: task.id, actor: 'operator', reason: 'Start', status: 'active' });
  writeFileSync(join(dir, 'evidence.json'), JSON.stringify({ artifactVersion: '0.1.0', projectId: m.project.id, synthetic: true, evidence: [], claims: [] }));
  const handoffs = new HandoffStore(tasks); const cp = handoffs.create({ taskId: task.id, fromAgent: 'scout', toAgent: 'analyst', modules: ['roles/analyst', 'methods/evidence-first', 'personas/calm-guide'], completedWork: [], openQuestions: ['Evidence gap'], nextAction: 'Report partial result', conclusion: 'No supported answer', uncertainty: 'Budget exhausted', budgetUsage: { sources: 0, iterations: 0 }, evidenceFile: 'evidence.json', evidenceIds: [], sameUnderlyingAgent: true });
  assert.deepEqual(cp.budgetUsage, { sources: 1, iterations: 1 }); handoffs.resume(cp.id);
  function move(change, kind) {
    const artifacts = []; if (kind) { writeFileSync(join(dir, `${kind}.md`), 'Synthetic partial report; evidence gaps disclosed'); artifacts.push({ path: `${kind}.md`, kind }); }
    tasks.submit({ type: 'transition', taskId: task.id, actor: 'operator', reason: 'Report partial outcome using existing evidence', artifacts, ...change });
  }
  for (const [phase, kind] of [['plan', 'charter'], ['gather', 'plan'], ['analyze', 'evidence']]) move({ phase }, kind);
  move({ phase: 'review', status: 'in_review' }, 'analysis');
  move({ phase: 'synthesize', review: { outcome: 'approved', reviewer: 'reviewer', selfReview: false, issues: ['Disclosed evidence gap'] } }, 'review');
  move({ phase: 'deliver' }, 'brief');
  move({ status: 'done', acceptedCriteria: ['Disclose gaps'], disposition: 'partial' }, 'delivery');
  assert.equal(tasks.list()[0].disposition, 'partial');
  assert.deepEqual(budget.snapshot().remaining, { sources: 0, iterations: 0 });
});
