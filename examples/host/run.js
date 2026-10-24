import { initializeProject } from '../../src/scaffold.js';
import { ReferenceHost } from '../../src/host.js';
import { fakeSourceTool, runFakeAgent } from '../../src/fake-adapter.js';
import { join, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
if (!process.argv[2]) throw new Error('Usage: node examples/host/run.js <new-directory>');
const dir = resolve(process.argv[2]); initializeProject(dir);
const calls = []; const host = new ReferenceHost({ manifestPath: join(dir, 'ramp.json'), tools: { read: fakeSourceTool({ 'fixture:source': 'Synthetic host demonstration, not research evidence' }, calls) } });
host.tasks.submit({ type: 'create', actor: 'operator', reason: 'Synthetic adapter demo', task: { id: 'T-demo', owner: 'scout', phase: 'scope', question: 'Demonstrate mediation', inputs: [], expectedOutput: 'Inspect tool outcomes', acceptanceCriteria: ['Only allowlisted tool is invoked'], status: 'planned', evidenceIds: [], artifacts: [], reopenedFrom: null } });
host.transition('scout', 'T-demo', { status: 'active' }, 'Start');
for (const [phase, kind] of [['plan', 'charter'], ['gather', 'plan']]) { writeFileSync(join(dir, `${kind}.md`), 'Synthetic gate artifact'); host.transition('scout', 'T-demo', { phase, artifacts: [{ path: `${kind}.md`, kind }] }, 'Demo gate'); }
host.startCycle('scout', 'T-demo', 'initial');
const base = { agentId: 'scout', taskId: 'T-demo', tool: 'read' };
console.log(JSON.stringify({ outcomes: await runFakeAgent(host, [{ ...base, resource: 'fixture:source' }, { ...base, resource: 'not-allowed' }]), underlyingCalls: calls, state: host.status() }, null, 2));
