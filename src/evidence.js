import { assertSchema, DiagnosticError, diagnostic } from './validation.js';
import { sha256 } from './protocol.js';
import { stableJson } from './lockfile.js';

export function validateEvidence(bundle, file = '<evidence>') {
  assertSchema('evidence', bundle, file);
  const errors = [];
  const fail = (code, message, path) => errors.push(diagnostic(code, message, file, path));
  const evidence = new Map(); const claims = new Map(); const ids = new Set();
  for (const kind of ['evidence', 'claims']) bundle[kind].forEach((record, i) => {
    if (ids.has(record.id)) fail('RECORD_DUPLICATE', `Duplicate record ID: ${record.id}`, `/${kind}/${i}/id`);
    ids.add(record.id); (kind === 'evidence' ? evidence : claims).set(record.id, record);
  });
  bundle.evidence.forEach((record, i) => {
    for (const id of record.supportedClaims) if (!claims.has(id)) fail('CLAIM_REFERENCE', `Unknown supported claim: ${id}`, `/evidence/${i}/supportedClaims`);
    for (const id of record.contradicts) {
      if (!evidence.has(id)) fail('EVIDENCE_REFERENCE', `Unknown contrary evidence: ${id}`, `/evidence/${i}/contradicts`);
      if (id === record.id) fail('EVIDENCE_SELF_REFERENCE', 'Evidence cannot contradict itself', `/evidence/${i}/contradicts`);
    }
  });
  bundle.claims.forEach((claim, i) => {
    const path = `/claims/${i}`;
    for (const field of ['evidenceIds', 'contraryEvidenceIds']) {
      for (const id of claim[field]) if (!evidence.has(id)) fail('EVIDENCE_REFERENCE', `Unknown evidence: ${id}`, `${path}/${field}`);
    }
    for (const id of claim.dependsOn) if (!claims.has(id)) fail('CLAIM_REFERENCE', `Unknown inference dependency: ${id}`, `${path}/dependsOn`);
    if (claim.status === 'verified' && (!claim.evidenceIds.length || claim.evidenceIds.some(id => evidence.get(id)?.status !== 'accessible'))) fail('CLAIM_UNSUPPORTED', 'Verified claims require accessible evidence; otherwise mark unverified', `${path}/evidenceIds`);
    if (claim.type === 'inference' && (!claim.dependsOn.length || !claim.reasoning)) fail('INFERENCE_REASONING', 'Inferences require underlying claim IDs and an explicit reasoning step', path);
    if (claim.type === 'inference' && claim.dependsOn.some(id => claims.get(id)?.type === 'hypothesis')) fail('INFERENCE_BASIS', 'A hypothesis is not an observed inference basis', `${path}/dependsOn`);
    if (claim.evidenceIds.some(id => claim.contraryEvidenceIds.includes(id))) fail('EVIDENCE_POLARITY', 'An evidence record cannot be both supporting and contrary for the same claim; split distinct observations', path);
  });
  const visiting = new Set(); const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { fail('CLAIM_CYCLE', `Circular inference dependency at ${id}`, `/claims/${bundle.claims.findIndex(c => c.id === id)}/dependsOn`); return; }
    if (visited.has(id) || !claims.has(id)) return;
    visiting.add(id); claims.get(id).dependsOn.forEach(visit); visiting.delete(id); visited.add(id);
  }
  bundle.claims.forEach(c => visit(c.id));
  if (errors.length) throw new DiagnosticError(errors);
  return bundle;
}

export function reviewHash(value) { return sha256(stableJson(value)); }

export function validateEvidenceReviews(bundle, reviews, file = '<reviews>') {
  validateEvidence(bundle); assertSchema('evidence-review', reviews, file);
  const errors = []; const ids = new Set();
  const fail = (message, path) => errors.push(diagnostic('REVIEW_BINDING', message, file, path));
  if (reviews.projectId !== bundle.projectId) fail('Review project does not match evidence', '/projectId');
  if (reviews.evidenceHash !== reviewHash(bundle)) fail('Reviews are stale: evidence content changed', '/evidenceHash');
  reviews.reviews.forEach((review, index) => {
    const path = `/reviews/${index}`; const claim = bundle.claims.find(c => c.id === review.claimId);
    if (ids.has(review.id)) fail('Duplicate review ID', `${path}/id`); ids.add(review.id);
    if (!claim) { fail('Unknown reviewed claim', `${path}/claimId`); return; }
    if (review.claimHash !== reviewHash(claim)) fail('Reviewed claim content changed', `${path}/claimHash`);
    review.passages.forEach((passage, i) => { if (![...claim.evidenceIds, ...claim.contraryEvidenceIds].includes(passage.evidenceId)) fail('Reviewed passage must reference evidence linked to this claim', `${path}/passages/${i}/evidenceId`); });
  });
  if (errors.length) throw new DiagnosticError(errors);
  return reviews;
}

export function evidenceAssessments(bundle, reviews) {
  validateEvidence(bundle); if (reviews) validateEvidenceReviews(bundle, reviews);
  return bundle.claims.map(claim => {
    const assessments = reviews?.reviews.filter(r => r.claimId === claim.id) ?? [];
    const outcomes = new Set(assessments.map(r => r.assessment));
    return { id: claim.id, referenceLinkage: !claim.evidenceIds.length ? 'unlinked' : claim.evidenceIds.every(id => bundle.evidence.find(e => e.id === id)?.status === 'accessible') ? 'linked_accessible' : 'linked_inaccessible',
      sourceSupport: !assessments.length ? 'not_reviewed' : outcomes.size === 1 ? [...outcomes][0] : 'uncertain', conflictingAssessments: outcomes.size > 1, assessments };
  });
}

export function evidenceMarkdown(bundle, reviews) {
  validateEvidence(bundle);
  const assessments = evidenceAssessments(bundle, reviews);
  const escape = v => String(v ?? 'unknown').replaceAll('|', '\\|').replaceAll('\n', ' ');
  const rows = bundle.evidence.map(e => `| ${[e.id, e.source, e.title, e.author, e.publisher, e.published, e.accessed, e.location, e.status, e.supportedClaims.join(', '), e.contradicts.join(', '), e.limitations.join('; ')].map(escape).join(' | ')} |`);
  const claims = bundle.claims.map((c, i) => `- **${c.id}** (${c.type}): ${escape(c.text)} Reference linkage: ${assessments[i].referenceLinkage}; recorded source support: **${assessments[i].sourceSupport.replaceAll('_', ' ')}**. Evidence: ${c.evidenceIds.join(', ') || 'none'}; contrary: ${c.contraryEvidenceIds.join(', ') || 'none'}; depends on: ${c.dependsOn.join(', ') || 'none'}. Reasoning: ${escape(c.reasoning)}. Uncertainty: ${escape(c.uncertainty)}\n${assessments[i].assessments.map(r => `  - ${escape(r.id)}: ${r.assessment}; ${r.reviewer.type} reviewer ${escape(r.reviewer.identity)}; ${r.reviewedAt}; passages ${r.passages.map(p => `${p.evidenceId} (${escape(p.location)})`).join(', ')}. Rationale: ${escape(r.rationale)}. Uncertainty: ${escape(r.uncertainty)}`).join('\n')}`).join('\n');
  return `# Evidence ledger: ${bundle.projectId}\n\n${bundle.synthetic ? '**Synthetic fixture; not research findings.**' : 'Recorded research evidence; source support requires review.'}\n\nReference linkage is structural. Recorded assessments are reviewer assertions, not factual verification or authenticated identities. Legacy verified/unverified labels do not supply source-support judgments.\n\n| ID | Source | Title | Author | Publisher | Published | Accessed | Location | Access | Claims | Contrary evidence | Limitations |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\n## Claims\n\n${claims}\n`;
}
