import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { initializeProject } from '../../src/scaffold.js';
import { loadProject } from '../../src/protocol.js';
import { TaskStore } from '../../src/tasks.js';

if (!process.argv[2]) throw new Error('Usage: node examples/workflow/run.js <new-directory>');
const dir = resolve(process.argv[2]); initializeProject(dir);
const store = new TaskStore(join(dir, '.ramp/tasks.jsonl'), loadProject(join(dir, 'ramp.json')), dir);
const task = { id: 'T-demo', owner: 'analyst', phase: 'scope', question: 'Synthetic workflow exercise; no research performed', inputs: [], expectedOutput: 'Synthetic brief', acceptanceCriteria: ['Workflow exercise recorded'], status: 'planned', evidenceIds: [], artifacts: [], reopenedFrom: null };
store.submit({ type: 'create', actor: 'operator', reason: 'Start synthetic demonstration', task });
let sequence = 0;
function move(change, kind) {
  const artifacts = [];
  if (kind) {
    const path = `${++sequence}-${kind}.md`; writeFileSync(join(dir, path), '# Synthetic workflow artifact\n\nNo research findings are implied.\n'); artifacts.push({ path, kind });
  }
  store.submit({ type: 'transition', taskId: task.id, actor: 'operator', reason: 'Synthetic workflow demonstration', artifacts, ...change });
}
move({ status: 'active' });
for (const [phase, kind] of [['plan', 'charter'], ['gather', 'plan'], ['analyze', 'evidence']]) move({ phase }, kind);
move({ phase: 'review', status: 'in_review' }, 'analysis');
move({ phase: 'analyze', status: 'active', review: { outcome: 'changes_requested', reviewer: 'reviewer', selfReview: false, issues: ['Synthetic missing locator'] } }, 'review');
move({ phase: 'review', status: 'in_review' }, 'analysis');
move({ phase: 'synthesize', review: { outcome: 'approved', reviewer: 'reviewer', selfReview: false, issues: [] } }, 'review');
move({ phase: 'deliver' }, 'brief');
move({ status: 'done', acceptedCriteria: task.acceptanceCriteria, disposition: 'complete' }, 'delivery');
console.log(JSON.stringify(store.list(), null, 2));
