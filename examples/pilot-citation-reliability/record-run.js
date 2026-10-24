import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject, readJson } from '../../src/protocol.js';
import { writeLock } from '../../src/lockfile.js';
import { TaskStore } from '../../src/tasks.js';
import { HandoffStore } from '../../src/handoffs.js';
import { BudgetStore } from '../../src/budgets.js';

const source = dirname(fileURLToPath(import.meta.url));
const [targetArg, condition = 'single-agent', stage = 'complete'] = process.argv.slice(2);
if (!targetArg || !['single-agent', 'separate-agents'].includes(condition) || !['prepare', 'complete', 'finalize'].includes(stage)) throw new Error('Usage: node record-run.js <new-directory> <single-agent|separate-agents> [prepare|complete|finalize]');
const dir = resolve(targetArg);
if (stage !== 'finalize') {
  mkdirSync(dir);
  for (const name of ['ramp.json', 'charter.md', 'plan.md', 'sources.json', 'evidence.json', 'single-agent-brief.md', 'self-review.md']) copyFileSync(join(source, name), join(dir, name));
  const sourceEvidence = readJson(join(dir, 'evidence.json')).value;
  sourceEvidence.claims = []; sourceEvidence.evidence.forEach(e => e.supportedClaims = []);
  writeFileSync(join(dir, 'source-evidence.json'), JSON.stringify(sourceEvidence, null, 2) + '\n');
}
const project = loadProject(join(dir, 'ramp.json'));
const tasks = new TaskStore(join(dir, '.ramp/tasks.jsonl'), project, dir);
const handoffs = new HandoffStore(tasks);
const budgets = new BudgetStore(join(dir, '.ramp/budgets.jsonl'), project.manifest.project.id, project.manifest.project.limits, project.agents.map(a => a.id));
const criteria = ['Cite examined sources', 'Retain uncertainty and open questions', 'Disclose evaluation limitations'];
const taskId = 'T-pilot';
const move = (change, path, kind) => tasks.submit({ type: 'transition', taskId, actor: condition === 'single-agent' ? 'same-chat-assistant' : 'role-separated-assistant', reason: 'Record/replay the source-packet research workflow', artifacts: path ? [{ path, kind }] : [], ...change });
const spend = (kind, key, reason) => { const token = budgets.reserve(kind, key, 'scout', reason); budgets.begin(token, 'scout'); budgets.finish(token, 'scout'); };
if (stage !== 'finalize') {
  tasks.submit({ type: 'create', actor: 'operator', reason: 'Record the bounded primary-source pilot', task: { id: taskId, owner: 'scout', phase: 'scope', question: project.manifest.project.question, inputs: ['sources.json'], expectedOutput: 'Cited, qualified brief', acceptanceCriteria: criteria, status: 'planned', evidenceIds: ['E-001', 'E-002', 'E-003'], artifacts: [], reopenedFrom: null } });
  move({ status: 'active' }); move({ phase: 'plan' }, 'charter.md', 'charter'); move({ phase: 'gather' }, 'plan.md', 'plan');
  spend('iterations', 'initial-source-review', 'Record initial research cycle');
  for (const s of readJson(join(dir, 'sources.json')).value.sources) spend('sources', s.url, 'Account for primary source examined in the saved public packet; replay does not refetch');
  move({ phase: 'analyze' }, 'source-evidence.json', 'evidence');
  const checkpoint = handoffs.create({ taskId, fromAgent: 'scout', toAgent: 'analyst', completedWork: ['Examined the three primary source passages'], openQuestions: ['Does human source review agree?', 'Would repeated unrelated cases show a practical benefit?'], nextAction: 'Analyze the packet and retain all qualifications', conclusion: 'Analysis pending; no general reliability result', uncertainty: 'Format assertions vary by implementation; sources are not independent; this is not a benchmark', budgetUsage: { sources: 3, iterations: 1 }, evidenceFile: 'source-evidence.json', evidenceIds: ['E-001', 'E-002', 'E-003'], sameUnderlyingAgent: condition === 'single-agent' });
  writeFileSync(join(dir, 'checkpoint.json'), JSON.stringify(checkpoint, null, 2) + '\n');
  writeFileSync(join(dir, 'restored-context.md'), handoffs.resume(checkpoint.id).instructions);
  writeLock(project, join(dir, 'ramp.lock.json'));
}
if (stage !== 'prepare') {
  const brief = condition === 'single-agent' ? 'single-agent-brief.md' : 'separate-agent-brief.md';
  const review = condition === 'single-agent' ? 'self-review.md' : 'separate-review.md';
  if (condition === 'separate-agents') { copyFileSync(join(source, brief), join(dir, brief)); copyFileSync(join(source, review), join(dir, review)); }
  move({ status: 'in_review', phase: 'review' }, brief, 'analysis');
  if (condition === 'single-agent') {
    move({ status: 'active', phase: 'analyze', review: { outcome: 'changes_requested', reviewer: 'analyst', selfReview: true, issues: ['Initial universal semantics hypothesis was too broad; corrected against E-001'] } }, review, 'review');
    spend('iterations', 'review-wording-correction', 'Record review-driven correction cycle');
    move({ status: 'in_review', phase: 'review' }, brief, 'analysis');
  } else spend('iterations', 'analyst-targeted-verification', 'Account for separate analyst reported second inspection cycle');
  move({ phase: 'synthesize', review: { outcome: 'approved', reviewer: condition === 'single-agent' ? 'analyst' : 'reviewer', selfReview: condition === 'single-agent', issues: ['Human review and general performance evidence remain absent'] } }, review, 'review');
  move({ phase: 'deliver' }, brief, 'brief');
  move({ status: 'done', acceptedCriteria: criteria, disposition: condition === 'single-agent' ? 'complete' : 'partial' }, brief, 'delivery');
  writeFileSync(join(dir, 'run.json'), JSON.stringify({ runVersion: '0.1.0', condition, source: 'Recorded live assistant workflow; this script reconstructs saved artifacts offline, not a new model run', model: 'Existing Codex session settings; exact identifier unavailable', task: tasks.list()[0], checkpoint: readJson(join(dir, 'checkpoint.json')).value, budgets: budgets.snapshot(), brief }, null, 2) + '\n');
}
console.log(`Recorded ${condition} (${stage}) in ${dir}; no new sources or model calls.`);
