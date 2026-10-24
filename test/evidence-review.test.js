import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from '../src/protocol.js';
import { validateEvidence, evidenceAssessments, evidenceMarkdown, validateEvidenceReviews, reviewHash } from '../src/evidence.js';
import { evaluateRecord } from '../src/evaluation.js';
const fixture = () => JSON.parse(readFileSync(join(REPO_ROOT, 'examples/evidence/synthetic.json'), 'utf8'));
function reviewsFor(bundle) {
  return { reviewVersion: '1', projectId: bundle.projectId, evidenceHash: reviewHash(bundle), reviews: [{ id: 'R-fixture', claimId: 'C-001', claimHash: reviewHash(bundle.claims[0]), assessment: 'unsupported', reviewer: { type: 'human', identity: 'Synthetic human identity; no actual human assessment' }, reviewedAt: '2026-10-24T07:00:00Z', passages: [{ evidenceId: 'E-001', location: 'entry 1' }], rationale: 'Synthetic negative control: a linked record does not support a universal truth guarantee.', uncertainty: 'Invented test judgment only' }] };
}
test('legacy verified linkage without a support judgment displays not reviewed, including an unsupported control', () => {
  const bundle = fixture(); bundle.claims[0].text = 'RAMP guarantees every research assertion is true.';
  validateEvidence(bundle); const before = evidenceAssessments(bundle); assert.equal(before[0].referenceLinkage, 'linked_accessible'); assert.equal(before[0].sourceSupport, 'not_reviewed'); assert.equal(bundle.claims[0].status, 'verified'); assert.match(evidenceMarkdown(bundle), /not reviewed/);
  const reviews = reviewsFor(bundle); const after = evidenceAssessments(bundle, reviews); assert.equal(after[0].sourceSupport, 'unsupported'); assert.deepEqual(bundle.claims[0].evidenceIds, ['E-001']); assert.equal(after[1].sourceSupport, 'not_reviewed'); assert.match(evidenceMarkdown(bundle, reviews), /human reviewer/);
  const evaluated = evaluateRecord({ run: { checkpoint: {}, task: {} }, evidence: bundle, reviews, brief: 'C-001 E-001', expected: { disposition: 'partial', evidenceIds: [], uncertaintyMarkers: [], openQuestions: [] } });
  assert.equal(evaluated.metrics.evidenceContractValid, true); assert.equal(evaluated.sourceSupportReview.claims[0].sourceSupport, 'unsupported'); assert.equal(evaluated.sourceSupportReview.factualVerification, 'not_checked');
});
test('review identities/types, disagreements and stale claim/passage bindings remain explicit', () => {
  const bundle = fixture(); const reviews = reviewsFor(bundle);
  reviews.reviews.push({ ...structuredClone(reviews.reviews[0]), id: 'R-model', assessment: 'supported', reviewer: { type: 'model', identity: 'Synthetic model fixture' } });
  const assessment = evidenceAssessments(bundle, reviews)[0]; assert.equal(assessment.sourceSupport, 'uncertain'); assert.equal(assessment.conflictingAssessments, true); assert.deepEqual(assessment.assessments.map(a => a.reviewer.type), ['human', 'model']);
  for (const mutate of [r => { r.evidenceHash = '0'.repeat(64); }, r => { r.reviews[0].claimHash = '0'.repeat(64); }, r => { r.reviews[0].passages[0].evidenceId = 'E-003'; }, r => { r.reviews[0].reviewedAt = 'yesterday'; }, r => { r.reviews[0].reviewer.identity = null; }]) { const next = structuredClone(reviews); mutate(next); assert.throws(() => validateEvidenceReviews(bundle, next)); }
  reviews.reviews[0].reviewer = { type: 'unknown', identity: null }; validateEvidenceReviews(bundle, reviews); assert.equal(evidenceAssessments(bundle, reviews)[0].assessments[0].reviewer.identity, null);
});
test('CLI keeps old bundles compatible and labels optional source support records separately', t => {
  const dir = mkdtempSync(join(tmpdir(), 'ramp reviews ')); t.after(() => rmSync(dir, { recursive: true, force: true })); const bundle = fixture();
  const path = join(dir, 'evidence.json'); const reviewPath = join(dir, 'reviews.json'); writeFileSync(path, JSON.stringify(bundle)); writeFileSync(reviewPath, JSON.stringify(reviewsFor(bundle)));
  const call = (...args) => spawnSync(process.execPath, [join(REPO_ROOT, 'src/cli.js'), ...args], { encoding: 'utf8' });
  const legacy = call('evidence-validate', path, '--json'); assert.equal(legacy.status, 0); assert.equal(JSON.parse(legacy.stdout).claims[0].sourceSupport, 'not_reviewed');
  const reviewed = call('evidence-export', path, '--reviews', reviewPath); assert.equal(reviewed.status, 0); assert.match(reviewed.stdout, /unsupported/); assert.match(reviewed.stdout, /not factual verification/);
});
