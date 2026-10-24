import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReferenceHost, initializeProject, loadProject, writeLock, validateEvidence, projectReport } from 'ramp-protocol';
import { runAssignment } from './adapter.js';
import { ScriptedModel } from './scripted-model.js';

export function setupWorkflow(directory, handler) {
  initializeProject(directory); const manifestPath = join(directory, 'ramp.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); manifest.project.question = 'What can this synthetic packet establish without real-world evidence?'; manifest.project.limits = { maxSources: 2, maxIterations: 2 };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n'); writeLock(loadProject(manifestPath), join(directory, 'ramp.lock.json'));
  const packet = [{ id: 'E-001', resource: 'fixture:source-a', text: 'Synthetic fixture: one invented transfer succeeded. This cannot establish general reliability.' }];
  writeFileSync(join(directory, 'packet.json'), JSON.stringify(packet, null, 2) + '\n');
  const calls = []; const successfulReads = [];
  const tools = { read: { capability: 'source.read', resources: packet.map(s => s.resource), phases: ['gather', 'analyze', 'review'], validateInput: input => input && typeof input === 'object' && Object.keys(input).length === 0,
    execute: async ({ resource, signal }) => { signal?.throwIfAborted(); calls.push(resource); const result = handler ? await handler({ resource, signal }) : packet.find(s => s.resource === resource); signal?.throwIfAborted(); successfulReads.push(resource); return result; } } };
  const host = new ReferenceHost({ manifestPath, tools, locked: true });
  host.tasks.submit({ type: 'create', actor: 'operator', reason: 'SDK integration exercise; synthetic only', task: { id: 'T-sdk', owner: 'scout', phase: 'scope', question: manifest.project.question, inputs: ['packet.json'], expectedOutput: 'Unverified notes for review', acceptanceCriteria: ['Disclose synthetic evidence and pending human review'], status: 'planned', evidenceIds: [], artifacts: [], reopenedFrom: null } });
  host.transition('scout', 'T-sdk', { status: 'active' }, 'Start scoped exercise');
  for (const [phase, kind] of [['plan', 'charter'], ['gather', 'plan']]) { writeFileSync(join(directory, `${kind}.md`), `Synthetic ${kind}: inspect only fixture:source-a, preserve qualifications, no general reliability finding.\n`); host.transition('scout', 'T-sdk', { phase, artifacts: [{ path: `${kind}.md`, kind }] }, 'Operator records gate'); }
  host.startCycle('scout', 'T-sdk', 'initial');
  return { host, tools, calls, successfulReads, packet, manifestPath, directory };
}

export async function runWorkflow(directory, { live = false, allowPaid = false, model } = {}) {
  const f = setupWorkflow(directory);
  const firstModel = live ? model : new ScriptedModel([
    { tool: 'ramp_request', args: { tool: 'read', resource: 'fixture:source-a' } },
    { tool: 'ramp_request', args: { tool: 'read', resource: 'not-allowlisted' } },
    { tool: 'ramp_request', args: { tool: 'forbidden', resource: 'fixture:source-a' } },
    { final: 'Synthetic exercise only. The one invented transfer does not establish general reliability; human source-support review is pending.' }
  ]);
  const scout = await runAssignment({ host: f.host, agentId: 'scout', taskId: 'T-sdk', model: firstModel, live, allowPaid, input: 'Read fixture:source-a with ramp_request tool read, then summarize only its limitations. Stop on denials.' });
  writeFileSync(join(directory, 'sdk-scout.json'), JSON.stringify(scout, null, 2) + '\n');
  // The trusted application records successful reads; it does not infer claims from model prose.
  const recordedEvidence = () => validateEvidence({ artifactVersion: '0.1.0', projectId: f.host.project.manifest.project.id, synthetic: true,
    evidence: f.packet.filter(s => f.successfulReads.includes(s.resource)).map(s => ({ id: s.id, source: s.resource, title: 'Synthetic source fixture', author: null, publisher: null, published: null, accessed: new Date().toISOString().slice(0, 10), location: 'packet.json, entry E-001', supportedClaims: [], limitations: ['Invented fixture; no real research result'], status: 'accessible', contradicts: [] })), claims: [] });
  const evidence = recordedEvidence();
  writeFileSync(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  f.host.transition('scout', 'T-sdk', { phase: 'analyze', artifacts: [{ path: 'evidence.json', kind: 'evidence' }] }, 'Record actual mediated reads; model prose remains unverified');
  writeFileSync(join(directory, 'source-context.json'), JSON.stringify({ contextVersion: '1', sourceDetails: evidence.evidence.map(e => ({ evidenceId: e.id, passage: f.packet.find(s => s.id === e.id).text, publicationStatus: 'Synthetic fixture, not published research', packetFile: 'packet.json', notes: ['No human source-support review was performed'] })) }, null, 2) + '\n');
  const checkpoint = f.host.checkpoint('scout', { taskId: 'T-sdk', toAgent: 'analyst', modules: ['roles/analyst', 'methods/evidence-first', 'personas/teaching-guide'], completedWork: ['SDK requested scoped fixture reads; denied calls recorded'], openQuestions: ['Does any real source support a broader claim?'], nextAction: 'Review synthetic limitations before human review', conclusion: 'No general finding; unverified model notes', uncertainty: 'Synthetic evidence only; no source-support judgment', evidenceFile: 'evidence.json', evidenceIds: evidence.evidence.map(e => e.id), budgetUsage: { sources: 0, iterations: 0 }, sameUnderlyingAgent: false, contextFile: 'source-context.json' });
  f.host.resume(checkpoint.id);
  const restarted = new ReferenceHost({ manifestPath: f.manifestPath, tools: f.tools, locked: true });
  const analystModel = live ? model : new ScriptedModel([{ tool: 'ramp_request', args: { tool: 'read', resource: 'fixture:source-a' } }, { final: 'Synthetic analysis: the packet is not empirical evidence. Preserve uncertainty and obtain human review before delivery.' }]);
  const analyst = await runAssignment({ host: restarted, agentId: 'analyst', taskId: 'T-sdk', model: analystModel, live, allowPaid, input: 'Use the handoff context, optionally reread fixture:source-a through tool read, and prepare notes for human review. Do not approve your own findings.' });
  writeFileSync(join(directory, 'analysis.md'), `# Unverified SDK model notes\n\n${analyst.finalOutput}\n\nSynthetic fixture; pending human review.\n`);
  writeFileSync(join(directory, 'sdk-analyst.json'), JSON.stringify(analyst, null, 2) + '\n');
  writeFileSync(join(directory, 'analysis-evidence.json'), JSON.stringify(recordedEvidence(), null, 2) + '\n');
  restarted.transition('analyst', 'T-sdk', { phase: 'review', status: 'in_review', artifacts: [{ path: 'analysis.md', kind: 'analysis' }, { path: 'analysis-evidence.json', kind: 'evidence' }] }, 'Operator submits notes; no automatic approval');
  const report = { mode: live ? 'live-authorized' : 'offline-scripted', sdkVersion: '0.21.0', model: live ? model : 'local ScriptedModel (not an external model)', disposition: 'pending human review', calls: f.calls, checkpointId: checkpoint.id, state: restarted.status(), audit: projectReport(f.manifestPath) };
  writeFileSync(join(directory, 'integration-report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
