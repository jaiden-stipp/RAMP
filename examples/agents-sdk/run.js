import { resolve } from 'node:path';
try {
  const args = process.argv.slice(2); const directory = args.shift();
  if (!directory || directory.startsWith('--')) throw new Error('Usage: npm run demo -- <new-directory> [--live --allow-paid --model <explicit-model>]');
  let live = false, allowPaid = false, model;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--live' && !live) live = true;
    else if (args[i] === '--allow-paid' && !allowPaid) allowPaid = true;
    else if (args[i] === '--model' && !model && args[i + 1] && !args[i + 1].startsWith('--')) model = args[++i];
    else throw new Error('Unknown, duplicate or incomplete demo option');
  }
  if (live && (!allowPaid || !model || !process.env.OPENAI_API_KEY)) throw new Error('Live calls require --live --allow-paid --model and OPENAI_API_KEY. No call was made.');
  if (!live && (allowPaid || model)) throw new Error('Model/spend options require explicit --live');
  if (!live) await import('./offline-guard.js');
  const { runWorkflow } = await import('./workflow.js');
  const report = await runWorkflow(resolve(directory), { live, allowPaid, model });
  console.log(JSON.stringify({ mode: report.mode, directory: resolve(directory), disposition: report.disposition, calls: report.calls, integrityPassed: report.audit.integrityPassed }, null, 2));
} catch (error) { console.error(`RAMP SDK example: ${error.message}`); process.exitCode = 1; }
