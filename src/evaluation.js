import { validateEvidence } from './evidence.js';

const HANDOFF_FIELDS = ['projectId', 'taskId', 'task', 'fromAgent', 'toAgent', 'sourceLock', 'destinationLock', 'completedWork', 'openQuestions', 'nextAction', 'conclusion', 'uncertainty', 'budgetUsage', 'evidence', 'evidenceIds'];
const PROVENANCE_FIELDS = ['id', 'source', 'title', 'author', 'publisher', 'published', 'accessed', 'location', 'limitations', 'status'];
const ratio = (passed, total) => ({ passed, total, score: total ? passed / total : null });
export function evaluateRecord({ run, evidence, expected, brief, humanJudgments = null, modelJudgments = null }) {
  if (!run || run.status === 'not_run') return { status: 'not_run', metrics: null, reason: run?.reason ?? 'No recorded condition' };
  let diagnostics = [];
  try { validateEvidence(evidence); } catch (e) { diagnostics = e.diagnostics ?? [{ message: e.message }]; }
  const context = run.checkpoint ?? {};
  const refs = [...brief.matchAll(/\b(E-\d+|C-\d+)\b/g)].map(m => m[1]);
  const known = new Set([...(evidence?.evidence ?? []).map(e => e.id), ...(evidence?.claims ?? []).map(c => c.id)]);
  const provenanceCount = (evidence?.evidence ?? []).reduce((n, e) => n + PROVENANCE_FIELDS.filter(k => Object.hasOwn(e, k) && e[k] !== undefined && (e[k] === null || typeof e[k] !== 'string' || e[k].trim())).length, 0);
  const preserved = expected.uncertaintyMarkers.filter(marker => String(context.uncertainty ?? '').includes(marker)).length;
  const questions = expected.openQuestions.filter(q => context.openQuestions?.includes(q)).length;
  const sources = expected.evidenceIds.filter(id => context.evidenceIds?.includes(id) && context.evidence?.evidence?.some(e => e.id === id)).length;
  return { status: 'evaluated', diagnostics, metrics: {
    evidenceContractValid: diagnostics.length === 0,
    citationReferenceResolution: ratio(refs.filter(r => known.has(r)).length, refs.length),
    provenanceCompleteness: ratio(provenanceCount, (evidence?.evidence?.length ?? 0) * PROVENANCE_FIELDS.length),
    uncertaintyPreservation: ratio(preserved, expected.uncertaintyMarkers.length),
    openQuestionPreservation: ratio(questions, expected.openQuestions.length),
    sourcePreservation: ratio(sources, expected.evidenceIds.length),
    handoffCompleteness: ratio(HANDOFF_FIELDS.filter(k => Object.hasOwn(context, k) && context[k] !== null && context[k] !== undefined && (typeof context[k] !== 'string' || context[k].trim())).length, HANDOFF_FIELDS.length),
    dispositionAccurateForDeclaredCriteria: run.task?.disposition === expected.disposition,
    humanSourceSupport: humanJudgments,
    modelAssistedSourceSupport: modelJudgments
  } };
}
