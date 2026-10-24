import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeProject } from '../src/scaffold.js';
import { ReferenceHost } from '../src/host.js';
import { fakeSourceTool, runFakeAgent } from '../src/fake-adapter.js';

function fixture(sources = 1) {
  const dir = join(mkdtempSync(join(tmpdir(), 'ramp-host-')), 'project'); initializeProject(dir);
  const manifestPath = join(dir, 'ramp.json'); const m = JSON.parse(readFileSync(manifestPath, 'utf8')); m.project.limits.maxSources = sources; writeFileSync(manifestPath, JSON.stringify(m));
  const calls = []; const tools = { read: fakeSourceTool({ 'fixture:a': 'Synthetic source A', 'fixture:b': 'Synthetic source B' }, calls) };
  const host = new ReferenceHost({ manifestPath, tools });
  host.tasks.submit({ type: 'create', actor: 'operator', reason: 'Synthetic test', task: { id: 'T-1', owner: 'scout', phase: 'scope', question: 'Synthetic test', inputs: [], expectedOutput: 'Report', acceptanceCriteria: ['Disclose limitations'], status: 'planned', evidenceIds: [], artifacts: [], reopenedFrom: null } });
  host.transition('scout', 'T-1', { status: 'active' }, 'Start');
  const move = (phase, kind) => { writeFileSync(join(dir, `${kind}.md`), 'Synthetic artifact'); host.transition('scout', 'T-1', { phase, artifacts: [{ path: `${kind}.md`, kind }] }, 'Gate'); };
  const request = { agentId: 'scout', taskId: 'T-1', tool: 'read', resource: 'fixture:a' };
  return { dir, manifestPath, calls, tools, host, move, request };
}
test('undeclared/unconfigured/out-of-scope/invalid/gated requests never invoke the underlying tool', async () => {
  const f = fixture();
  assert.equal((await runFakeAgent(f.host, [f.request]))[0].code, 'HOST_GATE');
  f.move('plan', 'charter'); f.move('gather', 'plan');
  await assert.rejects(f.host.requestTool(f.request), e => e.code === 'HOST_CYCLE');
  f.host.startCycle('scout', 'T-1', 'initial');
  for (const change of [{ tool: 'missing' }, { resource: 'https://outside.invalid' }, { input: { url: 'hidden destination' } }, { agentId: 'analyst' }]) await assert.rejects(f.host.requestTool({ ...f.request, ...change }));
  f.host.tools.secret = { ...f.tools.read, capability: 'network.send' };
  await assert.rejects(f.host.requestTool({ ...f.request, tool: 'secret' }), e => e.code === 'HOST_CAPABILITY');
  assert.equal(f.calls.length, 0);
  await f.host.requestTool(f.request); assert.equal(f.calls.length, 1);
  await assert.rejects(f.host.requestTool({ ...f.request, resource: 'fixture:b' }), e => e.code === 'BUDGET_EXHAUSTED');
  assert.equal(f.calls.length, 1);
});
test('checkpoint/persona resume survives host restart with unchanged authority and budget', async () => {
  const f = fixture(); f.move('plan', 'charter'); f.move('gather', 'plan'); f.host.startCycle('scout', 'T-1', 'initial'); await f.host.requestTool(f.request);
  writeFileSync(join(f.dir, 'evidence.json'), JSON.stringify({ artifactVersion: '0.1.0', projectId: f.host.project.manifest.project.id, synthetic: true, evidence: [], claims: [] }));
  const cp = f.host.checkpoint('scout', { taskId: 'T-1', toAgent: 'analyst', modules: ['roles/analyst', 'methods/evidence-first', 'personas/calm-guide'], completedWork: ['Read fixture'], openQuestions: ['No real evidence'], nextAction: 'Analyze fixture', conclusion: 'Synthetic', uncertainty: 'Unmeasured', budgetUsage: { sources: 0, iterations: 0 }, evidenceFile: 'evidence.json', evidenceIds: [], sameUnderlyingAgent: true });
  const original = f.host.project.agents.find(a => a.id === 'analyst').modules.flatMap(m => m.capabilities);
  f.host.resume(cp.id);
  const restarted = new ReferenceHost({ manifestPath: f.manifestPath, tools: f.tools });
  assert.match(restarted.assignment('analyst', 'T-1').instructions, /personas\/calm-guide/);
  assert.deepEqual(restarted.project.agents.find(a => a.id === 'analyst').modules.flatMap(m => m.capabilities), original);
  assert.equal(restarted.status().budget.consumed.sources, 1);
  await restarted.requestTool({ ...f.request, agentId: 'analyst' }); // existing-source read costs no new source.
  await assert.rejects(restarted.requestTool({ ...f.request, agentId: 'analyst', resource: 'fixture:b' }), e => e.code === 'BUDGET_EXHAUSTED');
});
test('blocked tasks and pre-start/in-flight cancellation have inspectable outcomes', async () => {
  const f = fixture(); f.move('plan', 'charter'); f.move('gather', 'plan'); f.host.startCycle('scout', 'T-1', 'initial');
  f.host.transition('scout', 'T-1', { status: 'blocked', blocker: 'Missing review', unblockCondition: 'Reviewer available' }, 'Wait');
  await assert.rejects(f.host.requestTool(f.request), e => e.code === 'HOST_GATE');
  f.host.transition('scout', 'T-1', { status: 'active', resolution: 'Reviewer available' }, 'Resume');
  const pre = new AbortController(); pre.abort(); await assert.rejects(f.host.requestTool({ ...f.request, signal: pre.signal }));
  assert.equal(f.calls.length, 0); assert.equal(f.host.status().budget.consumed.sources, 0);
  f.host.tools.read = { ...f.tools.read, execute: ({ signal }) => new Promise((resolve, reject) => { f.calls.push('started'); signal.addEventListener('abort', () => reject(signal.reason), { once: true }); }) };
  const pending = f.host.requestTool(f.request); f.host.cancel('scout', 'T-1', 'Cancelled test');
  await assert.rejects(pending, e => e.code === 'HOST_CANCELLED');
  assert.equal(f.host.status().budget.consumed.sources, 1);
  assert.ok(f.host.status().events.some(e => e.outcome === 'cancelled'));
});
