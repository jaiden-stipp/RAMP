import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { compose, loadProject } from './protocol.js';

const usage = 'Usage: node src/cli.js <validate|compose> <ramp.json> [--out <bundle.md>]';

try {
  const [command, path, ...options] = process.argv.slice(2);
  if (!['validate', 'compose'].includes(command) || !path) throw new Error(usage);
  const validOutputOption = command === 'compose' && options.length === 2 && options[0] === '--out' && options[1].trim().length > 0;
  if (options.length && !validOutputOption) throw new Error(usage);
  const manifestPath = resolve(path);
  if (validOutputOption && resolve(options[1]) === manifestPath) throw new Error('Output must not overwrite the project manifest');
  const project = loadProject(manifestPath);
  if (command === 'validate') {
    console.log(`Valid RAMP project: ${project.manifest.project.id} (${project.agents.length} agents)`);
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
  console.error(`RAMP: ${error.message}`);
  process.exitCode = 1;
}
