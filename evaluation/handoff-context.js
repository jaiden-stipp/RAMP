import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../src/protocol.js';
import { prepareHandoffContext, handoffContext, evaluateContextDetails } from '../src/handoff-context.js';
const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function evaluateHandoffContext() {
  const directory = join(root, 'examples/pilot-citation-reliability');
  const checkpoint = readJson(join(directory, 'recorded-single/checkpoint.json')).value;
  const packet = readJson(join(directory, 'sources.json')).value;
  const context = prepareHandoffContext({ contextVersion: '1', sourceDetails: packet.sources.map(s => ({ evidenceId: s.id, passage: s.shortExcerpt, publicationStatus: s.publicationStatus, notes: [s.notes], packetFile: 'sources.json' })) }, checkpoint, directory);
  const compact = handoffContext(checkpoint, context); const full = handoffContext(checkpoint, context, 'full');
  const original = handoffContext(checkpoint); const omitted = structuredClone(context); omitted.sourceDetails[0].passage = null; omitted.sourceDetails[1].publicationStatus = null;
  const expectations = packet.sources.flatMap(s => [{ id: `${s.id}:passage`, kind: 'passage', text: s.shortExcerpt }, { id: `${s.id}:publication`, kind: 'publication-status', text: s.publicationStatus }, { id: `${s.id}:qualification`, kind: 'caveat', text: s.notes }]);
  expectations.push({ id: 'packet-hash', kind: 'packet-hash', text: context.sourceDetails[0].packet.hash });
  return { evaluationVersion: 'handoff-context-1', retrospectiveFormattingCheck: true, newResearchOrModelRuns: 0, tokenCounts: null,
    sizing: { unit: 'Unicode code points in context section (shared instructions excluded)', compact: [...compact].length, full: [...full].length, reduction: 1 - [...compact].length / [...full].length, compactUtf8Bytes: Buffer.byteLength(compact), fullUtf8Bytes: Buffer.byteLength(full) },
    originalSnapshot: evaluateContextDetails(original, expectations), enrichedContext: evaluateContextDetails(compact, expectations), omittedDetailControl: evaluateContextDetails(handoffContext(checkpoint, omitted), expectations),
    originalInputsUnmodified: true, limitation: 'Exact declared text checks detect omissions, not paraphrase equivalence or semantic correctness. Retrospective packet enrichment cannot explain earlier brief quality. Full remote bytes/hashes remain unavailable.' };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(evaluateHandoffContext(), null, 2));
