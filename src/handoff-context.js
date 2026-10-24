import { assertSchema } from './validation.js';
import { artifactReference } from './tasks.js';

export function validateHandoffContext(context, checkpoint, directory) {
  assertSchema('handoff-context', context);
  const seen = new Set();
  for (const detail of context.sourceDetails) {
    if (seen.has(detail.evidenceId) || !checkpoint.evidence.evidence.some(e => e.id === detail.evidenceId)) throw new Error('Duplicate or unknown context evidence ID');
    seen.add(detail.evidenceId);
  }
  if (directory) for (const ref of [context.inputFile, ...context.sourceDetails.map(s => s.packet)].filter(Boolean)) {
    if (artifactReference(directory, { path: ref.path, kind: 'evidence' }).hash !== ref.hash) throw new Error(`Handoff context input changed: ${ref.path}`);
  }
  return context;
}

export function prepareHandoffContext(input, checkpoint, directory, inputFile = null) {
  if (!input || Object.keys(input).some(k => !['contextVersion', 'sourceDetails'].includes(k)) || input.contextVersion !== '1' || !Array.isArray(input.sourceDetails)) throw new Error('Context input requires contextVersion 1 and sourceDetails only');
  const sourceDetails = input.sourceDetails.map(detail => {
    if (!detail || Object.keys(detail).some(k => !['evidenceId', 'passage', 'publicationStatus', 'contentHash', 'packetFile', 'notes'].includes(k))) throw new Error('Unknown source context field');
    const ref = detail.packetFile ? artifactReference(directory, { path: detail.packetFile, kind: 'evidence' }) : null;
    return { evidenceId: detail.evidenceId, passage: detail.passage ?? null, publicationStatus: detail.publicationStatus ?? null, contentHash: detail.contentHash ?? null,
      packet: ref ? { path: ref.path, hash: ref.hash } : null, notes: detail.notes ?? [] };
  });
  return validateHandoffContext({ contextVersion: '1', inputFile, sourceDetails }, checkpoint, directory);
}

export function handoffContext(checkpoint, context = { contextVersion: '1', inputFile: null, sourceDetails: [] }, view = 'compact', history = []) {
  validateHandoffContext(context, checkpoint);
  if (!['compact', 'full'].includes(view)) throw new Error('Context view must be compact or full');
  if (view === 'full') return `## Complete recorded research context\n\n${JSON.stringify({ checkpoint, context, taskHistory: history }, null, 2)}\n\nRecorded artifacts only; no hidden model/session state is restored.\n`;
  const list = values => values.length ? values.map(x => `- ${x}`) : ['- None recorded; not proof that none exist.'];
  const c = checkpoint;
  const lines = ['## Research handoff summary', '', `Checkpoint: ${c.id}; task ${c.taskId}; ${c.fromAgent} → ${c.toAgent}.`,
    `State: ${c.task.status}/${c.task.phase}. Question: ${c.task.question}`, `Expected output: ${c.task.expectedOutput}`, `Acceptance: ${c.task.acceptanceCriteria.join('; ')}`,
    `Decision at snapshot: ${c.conclusion}`, `Uncertainty: ${c.uncertainty}`, `Next action (${c.toAgent}): ${c.nextAction}`,
    `Budget usage at snapshot: ${c.budgetUsage.sources} sources, ${c.budgetUsage.iterations} iterations.`,
    `Source manifest SHA-256: ${c.sourceLock.manifestHash}`, `Destination manifest SHA-256: ${c.destinationLock.manifestHash}`, `Core SHA-256: ${c.destinationLock.coreHash}`,
    `Material evidence IDs: ${c.evidenceIds.join(', ') || 'none declared'}`, '', '### Completed work', ...list(c.completedWork), '', '### Open questions', ...list(c.openQuestions), '', '### Source details and caveats'];
  for (const e of c.evidence.evidence) {
    const detail = context.sourceDetails.find(d => d.evidenceId === e.id);
    lines.push('', `- ${e.id}: ${e.title ?? 'title missing'}; ${e.source}; location: ${e.location ?? 'missing'}; access: ${e.status}; published: ${e.published ?? 'missing'}; accessed: ${e.accessed}.`,
      `  Publication status: ${detail?.publicationStatus ?? 'missing'}. Passage capture: ${detail?.passage ?? 'missing'}`,
      `  Remote content hash (asserted): ${detail?.contentHash ?? 'missing'}. Packet: ${detail?.packet ? `${detail.packet.path} SHA-256 ${detail.packet.hash}` : 'missing'}.`,
      `  Contrary record IDs: ${e.contradicts.join(', ') || 'none recorded'}. Caveats: ${e.limitations.join('; ') || 'none recorded'}.`, ...((detail?.notes ?? []).map(note => `  Packet note: ${note}`)));
  }
  lines.push('', '### Claims, contradictory findings and uncertainty');
  for (const claim of c.evidence.claims) lines.push(`- ${claim.id} (${claim.type}): ${claim.text} Supporting IDs: ${claim.evidenceIds.join(', ') || 'none'}; contrary IDs: ${claim.contraryEvidenceIds.join(', ') || 'none'}; dependencies: ${claim.dependsOn.join(', ') || 'none'}. Reasoning: ${claim.reasoning ?? 'not recorded'}. Caveat: ${claim.uncertainty}`);
  if (!c.evidence.claims.length) lines.push('- No claim records at this snapshot; no source-support judgment is implied.');
  lines.push('', `Full checkpoint/context and task history remain in .ramp/tasks.jsonl (checkpoint ${c.id}); use the full view to inspect prior event bodies, complete locks, author/publisher metadata, artifacts and repeated record fields. No records are truncated or deleted.`,
    `Compact view omits those repeated details; ${history.length} task-history events are available in the full view. No hidden model/session state is restored.`, 'Reference linkage, captures and hash strings do not establish source support or factual truth.');
  return `${lines.join('\n')}\n`;
}

export function evaluateContextDetails(text, expected) {
  const normalize = value => value.replace(/\s+/g, ' ').trim();
  const actual = normalize(text);
  const details = expected.map(detail => ({ ...detail, retained: actual.includes(normalize(detail.text)) }));
  return { passed: details.filter(d => d.retained).length, total: details.length, details, interpretation: 'Exact declared material-detail retention, not semantic equivalence, source truth or hidden-state restoration' };
}
