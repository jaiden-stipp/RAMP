import { assertSchema, DiagnosticError, diagnostic } from './validation.js';

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

export function evidenceMarkdown(bundle) {
  validateEvidence(bundle);
  const escape = v => String(v ?? 'unknown').replaceAll('|', '\\|').replaceAll('\n', ' ');
  const rows = bundle.evidence.map(e => `| ${[e.id, e.source, e.title, e.author, e.publisher, e.published, e.accessed, e.location, e.status, e.supportedClaims.join(', '), e.contradicts.join(', '), e.limitations.join('; ')].map(escape).join(' | ')} |`);
  return `# Evidence ledger: ${bundle.projectId}\n\n${bundle.synthetic ? '**Synthetic fixture; not research findings.**' : 'Recorded research evidence; source support requires review.'}\n\n| ID | Source | Title | Author | Publisher | Published | Accessed | Location | Access | Claims | Contrary evidence | Limitations |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\n## Claims\n\n${bundle.claims.map(c => `- **${c.id}** (${c.type}, ${c.status}): ${escape(c.text)} Evidence: ${c.evidenceIds.join(', ') || 'none'}; contrary: ${c.contraryEvidenceIds.join(', ') || 'none'}; depends on: ${c.dependsOn.join(', ') || 'none'}. Reasoning: ${escape(c.reasoning)}. Uncertainty: ${escape(c.uncertainty)}`).join('\n')}\n`;
}
