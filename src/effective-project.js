import { join } from 'node:path';
import { configureAgent } from './protocol.js';
import { compareLock } from './lockfile.js';
import { readJournal } from './journal.js';

// Always start with the disk manifest, never an already reconstructed project.
export function effectiveProject(base, directory, events = readJournal(join(directory, '.ramp/tasks.jsonl')).map(r => r.payload)) {
  const checkpoints = new Map(); const resumed = new Set();
  let project = base;
  for (const event of events) {
    if (event.type === 'checkpoint' && event.operation === 'created') checkpoints.set(event.checkpoint.id, event.checkpoint);
    if (!event.handoffId) continue;
    const checkpoint = checkpoints.get(event.handoffId);
    if (!checkpoint || resumed.has(checkpoint.id) || compareLock(checkpoint.sourceLock, project).length) throw new Error('Resumed checkpoint source configuration changed or checkpoint is invalid');
    project = configureAgent(project, checkpoint.toAgent, checkpoint.nextModules, directory);
    if (compareLock(checkpoint.destinationLock, project).length) throw new Error('Resumed checkpoint destination configuration changed');
    resumed.add(checkpoint.id);
  }
  return project;
}
