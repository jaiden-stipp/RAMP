import './offline-guard.js';
import { networkAttempts } from './offline-guard.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setupWorkflow, runWorkflow } from './workflow.js';
import { runAssignment, authorizeModel } from './adapter.js';
import { ScriptedModel } from './scripted-model.js';
import { ReferenceHost } from 'ramp-protocol';
function directory(t) { const parent = mkdtempSync(join(tmpdir(), 'ramp sdk ')); t.after(() => rmSync(parent, { recursive: true, force: true })); return join(parent, 'new research'); }
const request = (tool = 'read', resource = 'fixture:source-a') => ({ tool: 'ramp_request', args: { tool, resource } });
const invoke = (f, model, extra = {}) => runAssignment({ host: f.host, agentId: 'scout', taskId: 'T-sdk', model, input: 'Synthetic conformance fixture', ...extra });

test('actual SDK loop mediates allowed/denied calls, preserves context through restart, and awaits review', async t => {
  const dir = directory(t); const result = await runWorkflow(dir);
  assert.equal(result.mode, 'offline-scripted'); assert.equal(result.audit.integrityPassed, true); assert.equal(result.state.tasks[0].status, 'in_review'); assert.equal(result.state.tasks[0].owner, 'analyst');
  assert.equal(result.state.budget.consumed.sources, 1); assert.deepEqual(result.calls, ['fixture:source-a', 'fixture:source-a']);
  const events = result.state.events; assert.ok(events.some(e => e.type === 'tool-finish' && e.outcome === 'succeeded' && e.resultHash));
  for (const code of ['HOST_SCOPE', 'HOST_TOOL_DENIED']) assert.ok(events.some(e => e.type === 'adapter-denied' && e.code === code));
  const evidence = JSON.parse(readFileSync(join(dir, 'evidence.json'), 'utf8')); assert.equal(evidence.evidence.length, 1); assert.equal(evidence.claims.length, 0);
  const transcript = JSON.parse(readFileSync(join(dir, 'sdk-scout.json'), 'utf8')); const outputs = transcript.history.filter(i => i.type === 'function_call_result').map(i => JSON.parse(i.output.text)); assert.deepEqual(outputs.map(o => o.ok), [true, false, false]);
  const analyst = JSON.parse(readFileSync(join(dir, 'sdk-analyst.json'), 'utf8')); assert.ok(JSON.stringify(analyst.history).includes('fixture:source-a'));
  const resumed = new ReferenceHost({ manifestPath: join(dir, 'ramp.json'), locked: true }); const model = new ScriptedModel([{ final: 'Pending review; no new research' }]);
  await runAssignment({ host: resumed, agentId: 'analyst', taskId: 'T-sdk', model, input: 'Inspect saved context only' });
  assert.ok(model.requests[0].instructions.includes(result.checkpointId)); assert.match(model.requests[0].instructions, /No human source-support review was performed/); assert.match(model.requests[0].instructions, /Synthetic fixture: one invented transfer succeeded/);
  assert.equal(networkAttempts.length, 0);
});
test('unknown SDK tools, argument injection, forbidden capabilities and blocked phases never invoke handlers', async t => {
  const f = setupWorkflow(directory(t));
  await assert.rejects(invoke(f, new ScriptedModel([{ tool: 'unregistered_tool', args: {} }]))); assert.equal(f.calls.length, 0);
  await assert.rejects(invoke(f, new ScriptedModel([{ tool: 'ramp_request', args: { tool: 'read', resource: 'fixture:source-a', agentId: 'analyst' } }]))); assert.equal(f.calls.length, 0);
  f.host.tools.secret = { ...f.tools.read, capability: 'network.send', execute: () => { throw new Error('Forbidden handler executed'); } };
  const denied = await invoke(f, new ScriptedModel([request('secret'), { final: 'Denied' }])); assert.match(JSON.stringify(denied.history), /HOST_CAPABILITY/); assert.equal(f.calls.length, 0);
  f.host.transition('scout', 'T-sdk', { status: 'blocked', blocker: 'Missing review', unblockCondition: 'Reviewer available' }, 'Wait');
  const blocked = await invoke(f, new ScriptedModel([request(), { final: 'Blocked' }])); assert.match(JSON.stringify(blocked.history), /HOST_GATE/); assert.equal(f.calls.length, 0); assert.equal(networkAttempts.length, 0);
});
test('SDK cancellation propagates to a trusted handler and persists task/budget outcomes', { timeout: 15000 }, async t => {
  let started; const entered = new Promise(resolve => { started = resolve; });
  const f = setupWorkflow(directory(t), ({ signal }) => new Promise((resolve, reject) => { signal.addEventListener('abort', () => reject(signal.reason), { once: true }); started(); }));
  const pre = new AbortController(); pre.abort(new Error('Pre-start cancellation')); const idle = new ScriptedModel([request()]); await assert.rejects(invoke(f, idle, { signal: pre.signal })); assert.equal(idle.requests.length, 0); assert.equal(f.calls.length, 0);
  const controller = new AbortController(); const model = new ScriptedModel([request(), { final: 'Must not complete' }]); const pending = invoke(f, model, { signal: controller.signal }); await entered; controller.abort(new Error('Operator cancellation'));
  await assert.rejects(pending); const state = f.host.status(); assert.equal(state.tasks[0].status, 'cancelled'); assert.equal(state.budget.consumed.sources, 1); assert.ok(state.events.some(e => e.type === 'tool-finish' && e.outcome === 'cancelled')); assert.equal(networkAttempts.length, 0);
});
test('live path requires explicit spend authorization, model and credentials before any model call', t => {
  assert.throws(() => authorizeModel('explicit-model'), /no call was made/); assert.throws(() => authorizeModel('explicit-model', { live: true, allowPaid: false }), /--allow-paid/);
  const result = spawnSync(process.execPath, ['run.js', directory(t), '--live'], { encoding: 'utf8' }); assert.equal(result.status, 1); assert.match(result.stderr, /No call was made/); assert.equal(networkAttempts.length, 0);
});
