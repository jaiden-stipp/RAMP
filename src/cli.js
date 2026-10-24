import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { compose, loadProject } from './protocol.js';
import { diagnosticsOf } from './validation.js';

const usage = 'Usage: node src/cli.js <validate|compose> <ramp.json> [--out <bundle.md>] [--json (validate only)]';
const jsonMode = process.argv.includes('--json');

try {
  const [command, path, ...rawOptions] = process.argv.slice(2);
  if (jsonMode && command !== 'validate') throw new Error(usage);
  if (rawOptions.filter(x => x === '--json').length > 1) throw new Error(usage);
  const options = rawOptions.filter(x => x !== '--json');
  if (!['validate', 'compose'].includes(command) || !path) throw new Error(usage);
  const validOutputOption = command === 'compose' && options.length === 2 && options[0] === '--out' && options[1].trim().length > 0;
  if (options.length && !validOutputOption) throw new Error(usage);
  const manifestPath = resolve(path);
  if (validOutputOption && resolve(options[1]) === manifestPath) throw new Error('Output must not overwrite the project manifest');
  const project = loadProject(manifestPath);
  if (command === 'validate') {
    console.log(jsonMode ? JSON.stringify({ valid: true, project: project.manifest.project.id, diagnostics: [] }) : `Valid RAMP project: ${project.manifest.project.id} (${project.agents.length} agents)`);
  } else {
    const output = compose(project);
    if (validOutputOption) {
      const outputPath = resolve(options[1]);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, output, { encoding: 'utf8', flag: 'wx' });
      console.log(`Wrote ${outputPath}`);
    } else {
      process.stdout.write(output);
    }
  }
} catch (error) {
  if (jsonMode) console.log(JSON.stringify({ valid: false, diagnostics: diagnosticsOf(error, process.argv[3]) }));
  else console.error(`RAMP: ${error.message}`);
  process.exitCode = 1;
}
