import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateEvidence, evidenceMarkdown } from '../src/evidence.js';
const fixture = () => JSON.parse(readFileSync(new URL('../examples/evidence/synthetic.json', import.meta.url), 'utf8'));
test('synthetic supporting/contrary observations, inference, unknown metadata, and inaccessible gaps are explicit', () => {
  const b = validateEvidence(fixture());
  assert.match(evidenceMarkdown(b), /Synthetic fixture/);
  assert.match(evidenceMarkdown(b), /unknown/);
  assert.match(evidenceMarkdown(b), /inaccessible/);
  assert.ok(b.claims.every(c => c.evidenceIds.length || c.status === 'unverified'));
});
test('evidence audit rejects invalid dates, duplicate/dangling records, unsupported claims, and inference cycles with locations', () => {
  const cases = [
    [b => b.evidence[0].accessed = '2026-02-30', 'SCHEMA_FORMAT'],
    [b => b.evidence.push(b.evidence[0]), 'RECORD_DUPLICATE'],
    [b => b.claims[0].evidenceIds = ['absent'], 'EVIDENCE_REFERENCE'],
    [b => b.evidence[0].supportedClaims = ['absent'], 'CLAIM_REFERENCE'],
    [b => b.claims[0].evidenceIds = [], 'CLAIM_UNSUPPORTED'],
    [b => b.claims[0].evidenceIds = ['E-003'], 'CLAIM_UNSUPPORTED'],
    [b => b.claims[0].dependsOn = ['C-003'], 'CLAIM_CYCLE'],
    [b => b.claims[2].reasoning = null, 'INFERENCE_REASONING'],
    [b => b.claims[2].dependsOn = ['C-004'], 'INFERENCE_BASIS']
  ];
  for (const [mutate, code] of cases) {
    const b = fixture(); mutate(b);
    assert.throws(() => validateEvidence(b, 'evidence.json'), e => e.diagnostics.some(d => d.code === code && d.file === 'evidence.json' && d.path.startsWith('/')));
  }
});
