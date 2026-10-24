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
  files.set('README.md', `# Research project\n\nRequires RAMP package 0.1.0 (protocol ${manifest.protocolVersion}), installed or linked locally with its matching core and built-in modules. This is a draft local package, not an npm release. Install/link RAMP as described in its repository README before using these commands.\n\nEdit ramp.json to define the actual question, boundaries, budgets, and completion conditions before researching. This generated project contains no research findings.\n\nFrom this directory (including after moving it):\n\n\`\`\`sh\nramp validate ramp.json\nramp lock ramp.json\nramp validate ramp.json --locked\nramp compose ramp.json --agent scout --out scout.md --locked\n\`\`\`\n\nA lock pins exact core/module content, not just version labels. Share project-local modules under modules/ and retain ramp.lock.json. Never refresh a stale lock without reviewing ramp diff ramp.json.\n\nUse evidence-ledger.md, handoff.md, and research-brief.md to preserve research context. The host/operator supplies tools and enforces permissions and budgets. Composition does not run agents. Output files must not already exist.\n`);
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
