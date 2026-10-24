import { dirname, join, resolve } from 'node:path';
import { loadProject } from './protocol.js';
import { TaskStore, PHASES } from './tasks.js';
import { HandoffStore } from './handoffs.js';
import { BudgetStore } from './budgets.js';

const gates = ['charter', 'plan', 'evidence', 'analysis', 'review', 'brief', 'delivery'];
const common = ['actor', 'reason', 'dry-run'];
const definitions = {
  task: {
    create: ['id', 'owner', 'question', 'output', 'criterion*', 'input*', 'evidence-id*', 'reopened-from'],
    inspect: ['id'], activate: ['id', 'resolution'], block: ['id', 'blocker', 'until'],
    advance: ['id', 'phase', 'artifact'], review: ['id', 'reviewer', 'outcome', 'self-review', 'issue*', 'artifact', 'return-to'],
    complete: ['id', 'artifact', 'criterion*', 'disposition'], cancel: ['id']
  },
  checkpoint: { prepare: ['task', 'from', 'to', 'evidence', 'context', 'evidence-id*', 'module*', 'completed*', 'question*', 'next', 'conclusion', 'uncertainty', 'sources-used', 'iterations-used', 'same-agent'], preview: ['id', 'full', 'json'], resume: ['id', 'full', 'json'] }
};
const flags = new Set(['dry-run', 'self-review', 'same-agent', 'full', 'json']);
export function workflowHelp(group, verb) {
  const entries = definitions[group];
  if (!entries) throw new Error('Unknown workflow command');
  if (!verb) return `Usage: ramp ${group} <${Object.keys(entries).join('|')}> <ramp.json> [options]\nUse ramp ${group} <operation> --help for named options.`;
  if (!entries[verb]) throw new Error(`Unknown ${group} operation: ${verb}`);
  return `Usage: ramp ${group} ${verb} <ramp.json> ${[...entries[verb], ...common].map(name => `--${name.replace('*', '')}${flags.has(name) ? '' : ' <value>'}${name.endsWith('*') ? ' (repeatable)' : ''}`).join(' ')}\n\nUse task inspect before changing state to see owner, next gate and remaining budget.\nArtifacts are project-relative existing files. --dry-run validates task changes without writing.\nCheckpoint prepare requires explicit evidence, work, next action, conclusion and uncertainty; --same-agent discloses reused context.\nActor defaults to operator (a local assertion, not authentication). Ownership changes only through checkpoint resume.\nJSON-event commands tasks/handoff/budgets remain available.`;
}

export function workflowCommand(args) {
  const [group, verb, path, ...raw] = args;
  if (args.includes('--help') || args.includes('-h')) return workflowHelp(group, verb?.startsWith('-') ? undefined : verb);
  if (!definitions[group]?.[verb] || !path || path.startsWith('--')) throw new Error(workflowHelp(group));
  const allowed = new Map([...definitions[group][verb], ...common].map(name => [name.replace('*', ''), name.endsWith('*')]));
  const options = {};
  for (let index = 0; index < raw.length; index++) {
    const key = raw[index].slice(2);
    if (!raw[index].startsWith('--') || !allowed.has(key) || (Object.hasOwn(options, key) && !allowed.get(key))) throw new Error(`Unknown or duplicate option ${raw[index]}. See ramp ${group} ${verb} --help`);
    const value = flags.has(key) ? true : raw[++index];
    if (value !== true && (!value?.trim() || value.startsWith('--'))) throw new Error(`--${key} requires a value`);
    if (allowed.get(key)) (options[key] ??= []).push(value); else options[key] = value;
  }
  const required = key => { if (!options[key]?.length) throw new Error(`Missing --${key}. See ramp ${group} ${verb} --help`); return options[key]; };
  const manifestPath = resolve(path); const directory = dirname(manifestPath); const project = loadProject(manifestPath);
  const tasks = new TaskStore(join(directory, '.ramp/tasks.jsonl'), project, directory); const handoffs = new HandoffStore(tasks);
  const actor = options.actor ?? 'operator'; const reason = options.reason ?? `CLI ${group} ${verb}`;
  let result;
  if (group === 'checkpoint') {
    if (options['dry-run']) throw new Error('Checkpoint operations use preview before resume; --dry-run is supported on task changes');
    if (verb === 'preview') result = handoffs.preview(required('id'), { view: options.full ? 'full' : 'compact' });
    if (verb === 'resume') result = handoffs.resume(required('id'), actor, { view: options.full ? 'full' : 'compact' });
    if (verb === 'prepare') {
      const from = required('from'); if (actor !== 'operator' && actor !== from) throw new Error('Actor must be operator or the current owner');
      const usage = key => { const value = Number(options[key] ?? 0); if (!Number.isSafeInteger(value) || value < 0) throw new Error(`--${key} must be a nonnegative safe integer`); return value; };
      result = handoffs.create({ taskId: required('task'), fromAgent: from, toAgent: required('to'),
        evidenceFile: required('evidence'), ...(options.context ? { contextFile: options.context } : {}), evidenceIds: options['evidence-id'] ?? [], ...(options.module ? { modules: options.module } : {}),
        completedWork: required('completed'), openQuestions: options.question ?? [], nextAction: required('next'), conclusion: required('conclusion'), uncertainty: required('uncertainty'),
        budgetUsage: { sources: usage('sources-used'), iterations: usage('iterations-used') }, sameUnderlyingAgent: !!options['same-agent'] }, actor);
    }
  } else if (verb === 'create') {
    const task = { id: required('id'), owner: required('owner'), question: required('question'), expectedOutput: required('output'), acceptanceCriteria: required('criterion'),
      inputs: options.input ?? [], evidenceIds: options['evidence-id'] ?? [], reopenedFrom: options['reopened-from'] ?? null, status: 'planned', phase: 'scope', artifacts: [] };
    const event = { type: 'create', task, actor, reason }; result = options['dry-run'] ? tasks.preview(event) : tasks.submit(event);
  } else {
    const task = tasks.list().find(t => t.id === required('id')); if (!task) throw new Error('Unknown task; use ramp tasks <ramp.json> to list IDs');
    if (verb === 'inspect') {
      const budget = new BudgetStore(join(directory, '.ramp/budgets.jsonl'), project.manifest.project.id, project.manifest.project.limits, project.agents.map(a => a.id)).snapshot();
      result = { task, nextPhase: PHASES[PHASES.indexOf(task.phase) + 1] ?? null, requiredGate: gates[PHASES.indexOf(task.phase)], budget,
        pendingCheckpoints: handoffs.list().checkpoints.filter(c => c.taskId === task.id && !handoffs.list().resumed.includes(c.id)).map(c => c.id) };
    } else {
      if (actor !== 'operator' && actor !== task.owner && !(verb === 'review' && actor === options.reviewer)) throw new Error('Actor must be operator, current owner, or the explicitly named reviewer for a review');
      let change = {};
      if (verb === 'activate') change = { status: 'active', ...(options.resolution ? { resolution: options.resolution } : {}) };
      if (verb === 'block') change = { status: 'blocked', blocker: required('blocker'), unblockCondition: required('until') };
      if (verb === 'cancel') change = { status: 'cancelled' };
      if (verb === 'advance') {
        const phase = options.phase ?? PHASES[PHASES.indexOf(task.phase) + 1]; if (!phase) throw new Error('Already in delivery phase; use task complete');
        change = { phase, ...(phase === 'review' ? { status: 'in_review' } : {}), artifacts: [{ path: required('artifact'), kind: gates[PHASES.indexOf(task.phase)] }] };
      }
      if (verb === 'review') {
        if (task.phase !== 'review' || task.status !== 'in_review') throw new Error('Submit analysis through the review gate before recording a review');
        const outcome = required('outcome'); if (!['approved', 'changes_requested'].includes(outcome)) throw new Error('--outcome must be approved or changes_requested');
        if (outcome === 'approved' && options['return-to']) throw new Error('--return-to applies only to changes_requested');
        change = { phase: outcome === 'approved' ? 'synthesize' : options['return-to'] ?? 'analyze', ...(outcome === 'changes_requested' ? { status: 'active' } : {}),
          review: { outcome, reviewer: required('reviewer'), selfReview: !!options['self-review'], issues: options.issue ?? [] }, artifacts: [{ path: required('artifact'), kind: 'review' }] };
      }
      if (verb === 'complete') change = { status: 'done', disposition: required('disposition'), acceptedCriteria: required('criterion'), artifacts: [{ path: required('artifact'), kind: 'delivery' }] };
      const event = { ...change, type: 'transition', taskId: task.id, actor, reason };
      try { result = options['dry-run'] ? tasks.preview(event) : tasks.submit(event); }
      catch (error) { throw new Error(`${error.message}. Inspect requirements: ramp task inspect "${manifestPath}" --id ${task.id}`); }
    }
  }
  if (group === 'checkpoint' && ['preview', 'resume'].includes(verb) && !options.json) return result.instructions;
  return JSON.stringify({ dryRun: !!options['dry-run'], result }, null, 2);
}
