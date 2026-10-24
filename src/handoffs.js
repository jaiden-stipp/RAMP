import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertSchema } from './validation.js';
import { validateEvidence } from './evidence.js';
import { compose, configureAgent, readJson, sha256 } from './protocol.js';
import { configurationLock, compareLock, stableJson } from './lockfile.js';
import { appendJournal, readJournal } from './journal.js';
import { artifactReference } from './tasks.js';

function must(ok, message) { if (!ok) throw new Error(message); }
export class HandoffStore {
  constructor(tasks) { this.tasks = tasks; this.path = tasks.path; this.project = tasks.project; this.directory = tasks.directory; }
  replay(events) {
    const checkpoints = new Map(); const resumed = new Set();
    this.tasks.replay(events);
    for (const [index, event] of events.entries()) {
      if (event.type === 'checkpoint' && event.operation === 'created') {
        const c = event.checkpoint; assertSchema('handoff', c); validateEvidence(c.evidence);
        must(c.projectId === this.project.manifest.project.id && c.evidence.projectId === c.projectId && c.taskId === c.task.id, 'Checkpoint project/task mismatch');
        must(!checkpoints.has(c.id), 'Duplicate checkpoint ID');
        must(c.evidenceIds.every(id => c.evidence.evidence.some(e => e.id === id)), 'Checkpoint has missing evidence references');
        checkpoints.set(c.id, c);
      }
      if (event.handoffId) {
        const c = checkpoints.get(event.handoffId);
        must(c && !resumed.has(c.id) && event.taskId === c.taskId && event.owner === c.toAgent, 'Invalid or already resumed handoff');
        const before = this.tasks.replay(events.slice(0, index)).find(t => t.id === c.taskId);
        must(stableJson(before) === stableJson(c.task), 'Task changed since checkpoint; record a new handoff');
        resumed.add(c.id);
      }
    }
    return { checkpoints: [...checkpoints.values()], resumed: [...resumed] };
  }
  list() { return this.replay(readJournal(this.path).map(r => r.payload)); }
  append(event) { appendJournal(this.path, event, events => this.replay(events)); }
  create(input, actor = 'operator') {
    try {
      const task = this.tasks.list().find(t => t.id === input.taskId);
      must(task && !['done', 'cancelled'].includes(task.status), 'Unknown or terminal checkpoint task');
      must(task.owner === input.fromAgent, 'Checkpoint source must own the task');
      const source = this.project.agents.find(a => a.id === input.fromAgent);
      const target = this.project.agents.find(a => a.id === input.toAgent);
      must(source && target, 'Unknown checkpoint source/destination');
      const ids = input.modules ?? target.modules.map(m => m.id);
      const destination = configureAgent(this.project, target.id, ids, this.directory);
      const evidenceRef = artifactReference(this.directory, { path: input.evidenceFile, kind: 'evidence' });
      const evidence = validateEvidence(readJson(join(this.directory, evidenceRef.path)).value);
      must(evidence.projectId === this.project.manifest.project.id, 'Evidence belongs to the wrong project');
      const checkpoint = {
        artifactVersion: '0.1.0', id: randomUUID(), projectId: this.project.manifest.project.id, taskId: task.id, task,
        fromAgent: source.id, toAgent: target.id, sourceLock: configurationLock(this.project), destinationLock: configurationLock(destination),
        previousModules: source.modules.map(m => m.id), nextModules: ids,
        completedWork: input.completedWork, openQuestions: input.openQuestions, nextAction: input.nextAction,
        conclusion: input.conclusion, uncertainty: input.uncertainty, budgetUsage: input.budgetUsage,
        evidenceFile: evidenceRef.path, evidenceHash: evidenceRef.hash, evidence, evidenceIds: input.evidenceIds,
        artifacts: [...task.artifacts, ...(input.artifacts ?? []).map(a => artifactReference(this.directory, a))], sameUnderlyingAgent: input.sameUnderlyingAgent
      };
      assertSchema('handoff', checkpoint);
      must(checkpoint.budgetUsage.sources <= this.project.manifest.project.limits.maxSources && checkpoint.budgetUsage.iterations <= this.project.manifest.project.limits.maxIterations, 'Checkpoint budget usage exceeds project limits');
      this.append({ type: 'checkpoint', operation: 'created', projectId: checkpoint.projectId, actor, reason: 'Record research handoff', checkpoint });
      return checkpoint;
    } catch (error) {
      this.append({ type: 'checkpoint', operation: 'rejected', projectId: this.project.manifest.project.id, actor, reason: `Rejected handoff: ${error.message}`, request: { taskId: input.taskId ?? null, fromAgent: input.fromAgent ?? null, toAgent: input.toAgent ?? null, modules: input.modules ?? null } });
      throw error;
    }
  }
  preview(id) {
    const history = this.list(); const c = history.checkpoints.find(c => c.id === id);
    must(c && !history.resumed.includes(id), 'Unknown or already resumed checkpoint');
    const task = this.tasks.list().find(t => t.id === c.taskId);
    must(stableJson(task) === stableJson(c.task), 'Task changed since checkpoint; record a new handoff');
    must(compareLock(c.sourceLock, this.project).length === 0, 'Source configuration changed since checkpoint');
    must(artifactReference(this.directory, { path: c.evidenceFile, kind: 'evidence' }).hash === c.evidenceHash, 'Evidence changed since checkpoint');
    for (const a of c.artifacts) must(artifactReference(this.directory, a).hash === a.hash, `Artifact changed since checkpoint: ${a.path}`);
    const destination = configureAgent(this.project, c.toAgent, c.nextModules, this.directory);
    must(compareLock(c.destinationLock, destination).length === 0, 'Destination configuration changed since checkpoint');
    const disclosure = c.sameUnderlyingAgent ? 'Same underlying agent: any review of its own work is self-review, not independent verification.' : 'Separate agent assignment; independence still requires operator verification.';
    return { checkpoint: c, disclosure, instructions: `${compose(destination, c.toAgent)}\n## Restored research context\n\n${disclosure}\n\n${JSON.stringify({ sourceConfiguration: c.sourceLock, destinationConfiguration: c.destinationLock, task: c.task, completedWork: c.completedWork, evidence: c.evidence, openQuestions: c.openQuestions, conclusion: c.conclusion, uncertainty: c.uncertainty, budgetUsage: c.budgetUsage, nextAction: c.nextAction }, null, 2)}\n` };
  }
  resume(id, actor = 'operator') {
    const preview = this.preview(id); const c = preview.checkpoint;
    this.append({ type: 'transition', handoffId: id, projectId: c.projectId, taskId: c.taskId, owner: c.toAgent, actor, reason: `Resume handoff ${id}`, artifacts: [] });
    return preview;
  }
}
