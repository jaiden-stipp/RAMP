import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { compose, loadProject } from './protocol.js';
import { diagnosticsOf } from './validation.js';
import { initializeProject } from './scaffold.js';

const usage = `Usage:
  node src/cli.js init <new-directory>
  node src/cli.js validate <ramp.json> [--json]
  node src/cli.js compose <ramp.json> [--agent <id>] [--out <new-bundle.md>]
  node src/cli.js --help

init refuses existing directories. compose refuses existing output files.
Composition produces instructions; it does not launch agents.`;
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
try {
  if (args.length === 1 && ['--help', '-h', 'help'].includes(args[0])) {
    console.log(usage);
  } else {
    const [command, path, ...rawOptions] = args;
    if (!['init', 'validate', 'compose'].includes(command) || !path || path.startsWith('--')) throw new Error(usage);
    const accepted = { init: {}, validate: { '--json': false }, compose: { '--agent': true, '--out': true } }[command];
    const options = {};
    for (let index = 0; index < rawOptions.length; index++) {
      const name = rawOptions[index];
      if (!Object.hasOwn(accepted, name) || Object.hasOwn(options, name)) throw new Error(usage);
      options[name] = accepted[name] ? rawOptions[++index] : true;
      if (accepted[name] && (!options[name]?.trim() || options[name].startsWith('--'))) throw new Error(usage);
    }
    if (command === 'init') {
      const result = initializeProject(path);
      console.log(`Initialized RAMP project in ${result.directory}. Edit ramp.json, then validate and compose; see README.md.`);
    } else {
      const manifestPath = resolve(path);
      if (options['--out'] && resolve(options['--out']) === manifestPath) throw new Error('Output must not overwrite the project manifest');
      const project = loadProject(manifestPath);
      if (command === 'validate') {
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
