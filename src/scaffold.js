import { mkdirSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { REPO_ROOT, validateManifest } from './protocol.js';

export function initializeProject(directory) {
  const target = resolve(directory);
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'examples/literature-review/ramp.json'), 'utf8'));
  manifest.project.id = basename(target).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').replace(/^[^a-z]+/, '') || 'research-project';
  manifest.project.title = 'New research project';
  manifest.project.question = 'What research question should this project answer?';
  validateManifest(manifest);
  const files = new Map([['ramp.json', `${JSON.stringify(manifest, null, 2)}\n`]]);
  for (const name of ['evidence-ledger.md', 'handoff.md', 'research-brief.md']) files.set(name, readFileSync(join(REPO_ROOT, 'templates', name), 'utf8'));
  const cli = join(REPO_ROOT, 'src/cli.js').replaceAll('\\', '/');
  files.set('README.md', `# Research project\n\nEdit ramp.json to define the actual question, boundaries, budgets, and completion conditions before researching. This generated project contains no research findings.\n\nFrom this directory:\n\n\`\`\`sh\nnode "${cli}" validate ramp.json\nnode "${cli}" compose ramp.json\nnode "${cli}" compose ramp.json --agent scout --out scout.md\n\`\`\`\n\nUse evidence-ledger.md, handoff.md, and research-brief.md to preserve research context. The host/operator supplies tools and enforces permissions and budgets. Composition does not run agents. Output files must not already exist.\n`);
  mkdirSync(target);
  const written = [];
  try {
    for (const [name, content] of files) {
      const path = join(target, name);
      writeFileSync(path, content, { encoding: 'utf8', flag: 'wx' });
      written.push(path);
    }
  } catch (error) {
    // Remove only files created by this operation; preserve unexpected files.
    for (const path of written.reverse()) { try { unlinkSync(path); } catch {} }
    try { rmdirSync(target); } catch {}
    throw error;
  }
  return { directory: target, files: [...files.keys()] };
}
