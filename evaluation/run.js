import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateRecord } from '../src/evaluation.js';
import { readJson } from '../src/protocol.js';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pilot = join(root, 'examples/pilot-citation-reliability');
const expected = { disposition: 'complete', evidenceIds: ['E-001', 'E-002', 'E-003'], uncertaintyMarkers: ['Format assertions vary', 'sources are not independent', 'not a benchmark'], openQuestions: ['Does human source review agree?', 'Would repeated unrelated cases show a practical benefit?'] };
export function evaluatePilot() {
  const results = {};
  const inputs = {};
  const review = readJson(join(pilot, 'source-review.json')).value;
  for (const [condition, directory] of [['single-agent', 'recorded-single'], ['separate-agents', 'recorded-separate']]) {
    const run = readJson(join(pilot, directory, 'run.json')).value;
    const conditionExpected = { ...expected, disposition: condition === 'separate-agents' ? 'partial' : 'complete' };
    const input = { run, expected: conditionExpected, evidence: readJson(join(pilot, 'evidence.json')).value, brief: readFileSync(join(pilot, directory, run.brief), 'utf8'), modelJudgments: { reviewerType: review.reviewerType, humanReview: false, ...review.conditions[condition] } };
    inputs[condition] = input; results[condition] = evaluateRecord(input);
  }
  const controls = readJson(join(root, 'evaluation/fixtures/v1/cases.json')).value.cases.map(c => {
    const input = structuredClone(inputs['single-agent']);
    input.evidence.synthetic = true;
    input.modelJudgments = null; // Original source judgments do not apply to changed controls.
    if (c.mutation === 'missing-location') delete input.evidence.evidence[0].location;
    if (c.mutation === 'lost-uncertainty') input.run.checkpoint.uncertainty = '';
    if (c.mutation === 'lost-questions') input.run.checkpoint.openQuestions = [];
    if (c.mutation === 'wrong-disposition') { input.expected.disposition = 'partial'; input.run.task.disposition = 'complete'; }
    if (c.mutation === 'unsupported-claim') input.evidence.claims[0].text = 'Provenance records guarantee that every claim is true.';
    return { id: c.id, deliberatelyMutated: true, result: evaluateRecord(input) };
  });
  return { evaluationVersion: '1', recordedResearchConditions: 2, repeatedTrialsPerCondition: 1, humanReviewPerformed: false, causalImprovementEstablished: false, results, controls };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(evaluatePilot(), null, 2));
