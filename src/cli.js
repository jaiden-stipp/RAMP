#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { compose, loadProject } from './protocol.js';
import { diagnosticsOf } from './validation.js';
import { initializeProject } from './scaffold.js';
import { assertLocked, compareLock, lockPath, writeLock } from './lockfile.js';
import { readJson } from './protocol.js';
import { validateEvidence, evidenceMarkdown } from './evidence.js';
import { TaskStore } from './tasks.js';
import { join } from 'node:path';
import { HandoffStore } from './handoffs.js';
import { BudgetStore } from './budgets.js';
import { workflowCommand } from './workflow-cli.js';

const usage = `Usage:
  node src/cli.js init <new-directory>
  node src/cli.js validate <ramp.json> [--json] [--locked]
  node src/cli.js compose <ramp.json> [--agent <id>] [--out <new-bundle.md>] [--locked]
  node src/cli.js lock <ramp.json> [--update]
  node src/cli.js diff <ramp.json>
  node src/cli.js evidence-validate <evidence.json> [--json]
  node src/cli.js evidence-export <evidence.json>
  node src/cli.js tasks <ramp.json> [--event <task-event.json>]
  node src/cli.js handoff <ramp.json> [--create <request.json> | --preview <id> | --resume <id>]
  node src/cli.js budgets <ramp.json> [--event <budget-event.json>]
  node src/cli.js --help
  ramp task <create|inspect|activate|block|advance|review|complete|cancel> --help
  ramp checkpoint <prepare|preview|resume> --help

init refuses existing directories. compose refuses existing output files.
Composition produces instructions; it does not launch agents.`;
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
try {
  if (['task', 'checkpoint'].includes(args[0])) {
    console.log(workflowCommand(args));
  } else if (args.length === 1 && ['--help', '-h', 'help'].includes(args[0])) {
    console.log(usage);
  } else {
    const [command, path, ...rawOptions] = args;
    if (!['init', 'validate', 'compose', 'lock', 'diff', 'evidence-validate', 'evidence-export', 'tasks', 'handoff', 'budgets'].includes(command) || !path || path.startsWith('--')) throw new Error(usage);
    const accepted = { init: {}, validate: { '--json': false, '--locked': false }, compose: { '--agent': true, '--out': true, '--locked': false }, lock: { '--update': false }, diff: {}, 'evidence-validate': { '--json': false }, 'evidence-export': {}, tasks: { '--event': true }, handoff: { '--create': true, '--preview': true, '--resume': true }, budgets: { '--event': true } }[command];
    const options = {};
    for (let index = 0; index < rawOptions.length; index++) {
      const name = rawOptions[index];
      if (!Object.hasOwn(accepted, name) || Object.hasOwn(options, name)) throw new Error(usage);
      options[name] = accepted[name] ? rawOptions[++index] : true;
      if (accepted[name] && (!options[name]?.trim() || options[name].startsWith('--'))) throw new Error(usage);
    }
    if (command.startsWith('evidence-')) {
      const bundle = validateEvidence(readJson(resolve(path)).value, resolve(path));
      console.log(command === 'evidence-export' ? evidenceMarkdown(bundle) : jsonMode ? JSON.stringify({ valid: true, diagnostics: [] }) : `Valid evidence bundle: ${bundle.projectId}`);
    } else if (command === 'init') {
      const result = initializeProject(path);
      console.log(`Initialized RAMP project in ${result.directory}. Edit ramp.json, then validate and compose; see README.md.`);
    } else {
      const manifestPath = resolve(path);
      if (options['--out'] && resolve(options['--out']) === manifestPath) throw new Error('Output must not overwrite the project manifest');
      const project = loadProject(manifestPath);
      if (options['--locked']) assertLocked(project, lockPath(manifestPath));
      if (command === 'budgets') {
        const store = new BudgetStore(join(dirname(manifestPath), '.ramp/budgets.jsonl'), project.manifest.project.id, project.manifest.project.limits, project.agents.map(a => a.id));
        if (options['--event']) store.submit(readJson(resolve(options['--event'])).value);
        console.log(JSON.stringify(store.snapshot(), null, 2));
      } else if (command === 'handoff') {
        if (Object.keys(options).length > 1) throw new Error('Choose one handoff operation');
        const directory = dirname(manifestPath); const store = new HandoffStore(new TaskStore(join(directory, '.ramp/tasks.jsonl'), project, directory));
        const result = options['--create'] ? store.create(readJson(resolve(options['--create'])).value) : options['--preview'] ? store.preview(options['--preview']) : options['--resume'] ? store.resume(options['--resume']) : store.list();
        console.log(JSON.stringify(result, null, 2));
      } else if (command === 'tasks') {
        const directory = dirname(manifestPath);
        const tasks = new TaskStore(join(directory, '.ramp/tasks.jsonl'), project, directory);
        console.log(JSON.stringify(options['--event'] ? tasks.submit(readJson(resolve(options['--event'])).value) : tasks.list(), null, 2));
      } else if (command === 'lock') {
        const changes = writeLock(project, lockPath(manifestPath), !!options['--update']);
        console.log(JSON.stringify({ lock: lockPath(manifestPath), changes }, null, 2));
      } else if (command === 'diff') {
        console.log(JSON.stringify({ changes: compareLock(readJson(lockPath(manifestPath)).value, project) }, null, 2));
      } else if (command === 'validate') {
        console.log(jsonMode ? JSON.stringify({ valid: true, project: project.manifest.project.id, diagnostics: [] }) : `Valid RAMP project: ${project.manifest.project.id} (${project.agents.length} agents)`);
      } else {
        const output = compose(project, options['--agent']);
        if (options['--out']) {
          const outputPath = resolve(options['--out']);
          mkdirSync(dirname(outputPath), { recursive: true });
          writeFileSync(outputPath, output, { encoding: 'utf8', flag: 'wx' });
          console.log(`Wrote ${outputPath}`);
        } else process.stdout.write(output);
      }
    }
  }
} catch (error) {
  if (jsonMode) console.log(JSON.stringify({ valid: false, diagnostics: diagnosticsOf(error, process.argv[3]) }));
  else console.error(`RAMP: ${error.message}`);
  process.exitCode = 1;
}
