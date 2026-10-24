import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { initializeProject } from '../src/scaffold.js';
import { REPO_ROOT } from '../src/protocol.js';
import { ReferenceHost } from '../src/host.js';
import { evaluateHandoffContext } from '../evaluation/handoff-context.js';

test('pilot compact view is measured shorter and detects meaningful omissions with every ID still present', () => {
  const result = evaluateHandoffContext(); assert.ok(result.sizing.reduction > .2); assert.equal(result.enrichedContext.passed, result.enrichedContext.total);
  assert.ok(result.originalSnapshot.passed < result.enrichedContext.passed); assert.equal(result.omittedDetailControl.passed, result.enrichedContext.passed - 2);
  assert.ok(result.omittedDetailControl.details.some(d => d.id === 'E-001:passage' && !d.retained)); assert.ok(result.omittedDetailControl.details.some(d => d.id === 'E-002:publication' && !d.retained));
  assert.deepEqual(result, JSON.parse(readFileSync(join(REPO_ROOT, 'examples/pilot-citation-reliability/handoff-context-evaluation.json'), 'utf8')));
});
test('versioned context preserves complete history and provenance across resume/restart and pins source packets', t => {
  const parent = mkdtempSync(join(tmpdir(), 'ramp context ')); t.after(() => rmSync(parent, { recursive: true, force: true })); const dir = join(parent, 'project'); initializeProject(dir);
  const manifestPath = join(dir, 'ramp.json'); const host = new ReferenceHost({ manifestPath });
  host.tasks.submit({ type: 'create', actor: 'operator', reason: 'Synthetic context test', task: { id: 'T-1', owner: 'scout', phase: 'scope', question: 'Synthetic', inputs: [], expectedOutput: 'Report', acceptanceCriteria: ['Preserve caveats'], status: 'planned', evidenceIds: [], artifacts: [], reopenedFrom: null } }); host.transition('scout', 'T-1', { status: 'active' }, 'Begin');
  const evidence = JSON.parse(readFileSync(join(REPO_ROOT, 'examples/evidence/synthetic.json'), 'utf8')); evidence.projectId = host.project.manifest.project.id; writeFileSync(join(dir, 'evidence.json'), JSON.stringify(evidence));
  writeFileSync(join(dir, 'packet.txt'), 'Synthetic passage only'); writeFileSync(join(dir, 'context.json'), JSON.stringify({ contextVersion: '1', sourceDetails: [{ evidenceId: 'E-001', passage: 'Synthetic passage only', publicationStatus: 'Synthetic fixture', packetFile: 'packet.txt', notes: ['Do not generalize'] }] }));
  const cp = host.checkpoint('scout', { taskId: 'T-1', toAgent: 'analyst', completedWork: ['Recorded fixtures'], openQuestions: ['Does this generalize?'], nextAction: 'Review', conclusion: 'No real result', uncertainty: 'Synthetic', budgetUsage: { sources: 0, iterations: 0 }, evidenceFile: 'evidence.json', evidenceIds: ['E-001', 'E-002'], sameUnderlyingAgent: true, contextFile: 'context.json' });
  const compact = host.handoffs.preview(cp.id); const full = host.handoffs.preview(cp.id, { view: 'full' });
  assert.match(compact.instructions, /Synthetic passage only/); assert.match(compact.instructions, /Passage capture: missing/); assert.match(compact.instructions, /E-002/); assert.match(compact.instructions, /Fixture only; conditions differ/); assert.match(full.instructions, /taskHistory/); assert.match(full.instructions, /Synthetic context test/);
  const cli = (...args) => spawnSync(process.execPath, [join(REPO_ROOT, 'src/cli.js'), 'checkpoint', 'preview', manifestPath, '--id', cp.id, ...args], { encoding: 'utf8' });
  const concise = cli(); assert.equal(concise.status, 0); assert.match(concise.stdout, /Research handoff summary/); const complete = cli('--full'); assert.equal(complete.status, 0); assert.match(complete.stdout, /Complete recorded research context/);
  host.resume(cp.id); const restarted = new ReferenceHost({ manifestPath }); assert.deepEqual(restarted.handoffs.list().contexts[cp.id], full.context); assert.equal(restarted.tasks.list()[0].owner, 'analyst');
  writeFileSync(join(dir, 'packet.txt'), 'Changed packet'); assert.throws(() => new ReferenceHost({ manifestPath }), /context input changed/);
});
