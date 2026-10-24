import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { assertSchema } from './validation.js';
import { appendJournal, readJournal } from './journal.js';
import { contained } from './module-loader.js';
import { sha256 } from './protocol.js';

export const PHASES = ['scope', 'plan', 'gather', 'analyze', 'review', 'synthesize', 'deliver'];
const GATES = ['charter', 'plan', 'evidence', 'analysis', 'review', 'brief', 'delivery'];
const TRANSITIONS = { planned: ['active', 'cancelled'], active: ['blocked', 'in_review', 'cancelled'], blocked: ['active', 'cancelled'], in_review: ['active', 'done', 'cancelled'], done: [], cancelled: [] };
function requireValue(ok, message) { if (!ok) throw new Error(message); }
function text(value) { return typeof value === 'string' && !!value.trim(); }

export function artifactReference(projectDirectory, artifact) {
  requireValue(artifact && text(artifact.path) && GATES.includes(artifact.kind) && !isAbsolute(artifact.path), 'Artifact requires a relative path and recognized kind');
  const root = realpathSync(projectDirectory);
  const path = realpathSync(join(root, artifact.path));
  requireValue(contained(root, path), 'Artifact resolves outside project');
  return { path: artifact.path.replaceAll('\\', '/'), kind: artifact.kind, hash: sha256(readFileSync(path, 'utf8')) };
}

export function replayTasks(events, projectId, agentIds) {
  const tasks = new Map();
  for (const event of events) {
    requireValue(event.projectId === projectId && text(event.actor) && text(event.reason), 'Task event requires matching project, actor, and reason');
    if (event.type === 'checkpoint') {
      requireValue(['created', 'rejected'].includes(event.operation), 'Unknown checkpoint operation');
      continue;
    }
    if (event.type === 'create') {
      const t = event.task; assertSchema('task', t);
      requireValue(!tasks.has(t.id) && t.status === 'planned' && t.phase === 'scope', 'New tasks need a unique ID and start planned in scope');
      requireValue(agentIds.includes(t.owner), `Unknown task owner: ${t.owner}`);
      if (t.reopenedFrom !== null) requireValue(tasks.get(t.reopenedFrom)?.status === 'done', 'Reopened task must link a completed task');
      tasks.set(t.id, { ...structuredClone(t), blocker: null, unblockCondition: null, review: null, disposition: null });
      continue;
    }
    requireValue(event.type === 'transition', 'Unknown task event type');
    const previous = tasks.get(event.taskId); requireValue(previous, `Unknown task: ${event.taskId}`);
    const next = { ...previous, status: event.status ?? previous.status, phase: event.phase ?? previous.phase };
    requireValue(!['done', 'cancelled'].includes(previous.status), 'Terminal task is immutable; create a linked task to reopen completed work');
    if (next.status !== previous.status) requireValue(TRANSITIONS[previous.status].includes(next.status), `Invalid task transition: ${previous.status} -> ${next.status}`);
    const delta = PHASES.indexOf(next.phase) - PHASES.indexOf(previous.phase);
    requireValue(PHASES.includes(next.phase) && delta <= 1, 'Phases advance one gate at a time');
    const artifacts = event.artifacts ?? [];
    requireValue(Array.isArray(artifacts) && artifacts.every(a => text(a.path) && GATES.includes(a.kind) && /^[a-f0-9]{64}$/.test(a.hash)), 'Invalid artifact references in task history');
    requireValue(artifacts.every(a => !isAbsolute(a.path) && !a.path.split(/[\\/]/).includes('..')), 'Artifact paths must be project-relative without traversal');
    if (delta > 0) {
      requireValue(!['planned', 'blocked'].includes(previous.status), 'Start/unblock work before advancing a phase');
      requireValue(artifacts.some(a => a.kind === GATES[PHASES.indexOf(previous.phase)]), `Missing ${GATES[PHASES.indexOf(previous.phase)]} gate artifact`);
    }
    if (delta < 0) requireValue(event.review?.outcome === 'changes_requested' && artifacts.some(a => a.kind === 'review'), 'Returning to an earlier phase requires a recorded failed review and reason');
    if (event.review) {
      requireValue(['approved', 'changes_requested'].includes(event.review.outcome) && text(event.review.reviewer) && typeof event.review.selfReview === 'boolean' && Array.isArray(event.review.issues), 'Review requires outcome, reviewer, self-review disclosure, and issues');
      requireValue(artifacts.some(a => a.kind === 'review'), 'Review outcome requires a review artifact');
      requireValue(event.review.reviewer !== previous.owner || event.review.selfReview, 'A task owner reviewing their own work must disclose self-review');
      next.review = structuredClone(event.review);
    }
    if (previous.phase === 'review' && delta > 0) requireValue(next.review?.outcome === 'approved', 'Review must pass explicitly before synthesis');
    if (next.status === 'blocked') {
      requireValue(text(event.blocker) && text(event.unblockCondition), 'Blocked work requires blocker and unblock condition');
      next.blocker = event.blocker; next.unblockCondition = event.unblockCondition;
    }
    if (previous.status === 'blocked' && next.status === 'active') { requireValue(text(event.resolution), 'Resuming blocked work requires a resolution'); next.blocker = null; next.unblockCondition = null; }
    if (next.status === 'in_review' && previous.status !== 'in_review') requireValue(next.phase === 'review' && artifacts.some(a => a.kind === 'analysis'), 'Review submission requires analysis artifact in review phase');
    if (next.status === 'done') {
      requireValue(next.phase === 'deliver' && next.review?.outcome === 'approved' && artifacts.some(a => a.kind === 'delivery'), 'Completion requires delivery phase, approved review, and delivery artifact');
      requireValue(Array.isArray(event.acceptedCriteria) && previous.acceptanceCriteria.every(c => event.acceptedCriteria.includes(c)), 'Completion requires explicit acceptance of every criterion');
      requireValue(['complete', 'partial', 'blocked'].includes(event.disposition), 'Delivery needs complete/partial/blocked disposition'); next.disposition = event.disposition;
    }
    if (event.owner !== undefined) { requireValue(agentIds.includes(event.owner), 'Unknown next task owner'); next.owner = event.owner; }
    next.artifacts = [...previous.artifacts, ...artifacts];
    tasks.set(next.id, next);
  }
  return [...tasks.values()];
}

export class TaskStore {
  constructor(path, project, projectDirectory) { this.path = path; this.baseProject = project; this.project = project; this.directory = projectDirectory; }
  replay(events) { return replayTasks(events, this.project.manifest.project.id, this.project.agents.map(a => a.id)); }
  list() { return this.replay(readJournal(this.path).map(r => r.payload)); }
  event(input) {
    const event = { ...structuredClone(input), projectId: this.project.manifest.project.id };
    if (event.type === 'transition') event.artifacts = (event.artifacts ?? []).map(a => artifactReference(this.directory, a));
    return event;
  }
  preview(input) { return this.replay([...readJournal(this.path).map(r => r.payload), this.event(input)]); }
  submit(input) {
    const event = this.event(input);
    appendJournal(this.path, event, events => this.replay(events));
    return this.list();
  }
}
