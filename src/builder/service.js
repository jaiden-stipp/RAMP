import { readFileSync, readdirSync, realpathSync, mkdirSync, lstatSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { REPO_ROOT, readJson, loadProjectData, validateModule, compose, sha256 } from '../protocol.js';
import { moduleRoots, resolveModuleFile } from '../module-loader.js';
import { configurationLock, compareLock } from '../lockfile.js';
import { diagnosticsOf } from '../validation.js';

const json = value => `${JSON.stringify(value, null, 2)}\n`;

export function createBuilderService(manifestPath, root = REPO_ROOT) {
  const raw = readFileSync(manifestPath, 'utf8');
  const baseHash = sha256(Buffer.from(raw));
  let initial = null; let baseline = null; let initialDiagnostics = [];
  try { initial = readJson(manifestPath).value; baseline = configurationLock(loadProjectData(initial, { manifestPath, root })); }
  catch (error) { initialDiagnostics = diagnosticsOf(error, 'ramp.json'); }
  const directory = dirname(manifestPath);
  const reviews = new Map();

  function catalog() {
    const modules = []; const diagnostics = []; const seen = new Set();
    let locations = [];
    try { locations = moduleRoots(root, directory); } catch (error) { diagnostics.push(...diagnosticsOf(error, 'modules')); }
    for (const location of locations) {
      for (const kind of ['roles', 'methods', 'personas', 'outputs']) {
        let entries;
        try { entries = readdirSync(join(location.path, kind)); }
        catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        for (const name of entries.sort()) {
          if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.json$/.test(name)) continue;
          const id = `${kind}/${name.slice(0, -5)}`;
          if (seen.has(id)) continue;
          seen.add(id);
          try {
            const { path, origin } = resolveModuleFile(id, root, directory);
            const module = validateModule(readJson(path).value, id, path);
            modules.push({ ...module, origin });
          } catch (error) { diagnostics.push(...diagnosticsOf(error, id)); }
        }
      }
    }
    return { manifest: initial, raw, baseHash, workspaceKey: sha256(manifestPath), initialDiagnostics, modules, diagnostics, core: readFileSync(join(root, 'spec', 'CORE.md'), 'utf8') };
  }

  function projectFor(manifest) { return loadProjectData(manifest, { manifestPath, root }); }

  function validate(manifest) {
    try {
      const project = projectFor(manifest);
      return { valid: true, diagnostics: [], changes: baseline ? compareLock(baseline, project) : [{ kind: 'baseline-invalid', message: 'Opened configuration was invalid; compare the manifest in the draft-save review.' }],
        previews: project.agents.map(agent => ({ id: agent.id, instructions: compose(project, agent.id) })),
        lock: configurationLock(project) };
    } catch (error) { return { valid: false, diagnostics: diagnosticsOf(error, 'ramp.json'), changes: [], previews: [] }; }
  }

  function archive(manifest) {
    const project = projectFor(manifest);
    const files = { 'ramp.json': strToU8(json(manifest)), 'ramp.lock.json': strToU8(json(configurationLock(project))),
      'instructions/all-agents.md': strToU8(compose(project)),
      'README.txt': strToU8('RAMP configuration export\n\nUse the same RAMP protocol/core and built-in module versions. From the RAMP checkout:\nnode src/cli.js validate <export-directory>/ramp.json --locked\nnode src/cli.js compose <export-directory>/ramp.json --locked\n\nSelected project-local modules are included. This archive contains instructions, not running agents.\n') };
    for (const agent of project.agents) {
      files[`instructions/agents/${agent.id}.md`] = strToU8(compose(project, agent.id));
      for (const module of agent.modules) {
        if (module.origin.startsWith('project:')) files[`modules/${module.id}.json`] = strToU8(readFileSync(module.sourcePath, 'utf8'));
      }
    }
    return zipSync(files, { level: 6 });
  }
  function unchanged(expected) {
    if (expected !== baseHash || sha256(readFileSync(manifestPath)) !== baseHash) throw new Error('Opened manifest changed on disk; restart the builder and review your recovered draft against the new file');
  }
  function draftPreview(input) {
    if (!input || Object.keys(input).some(k => !['raw', 'baseHash'].includes(k)) || typeof input.raw !== 'string') throw new Error('Draft review accepts raw text and baseHash only; filesystem targets are fixed');
    unchanged(input.baseHash);
    for (const [id, review] of reviews) if (review.expires < Date.now()) reviews.delete(id);
    if (reviews.size >= 20) throw new Error('Too many pending draft reviews; restart or save an existing review');
    const token = randomUUID(); const path = `.ramp/drafts/${randomUUID()}.json`;
    reviews.set(token, { raw: input.raw, path, expires: Date.now() + 10 * 60 * 1000 });
    const before = raw.split('\n'); const after = input.raw.split('\n');
    let start = 0; while (start < before.length && start < after.length && before[start] === after[start]) start++;
    let end = 0; while (end < before.length - start && end < after.length - start && before.at(-1 - end) === after.at(-1 - end)) end++;
    const diff = before.slice(start, before.length - end).map(line => `- ${line}`).concat(after.slice(start, after.length - end).map(line => `+ ${line}`)).join('\n');
    return { token, path, diff: diff || 'No text changes.', unchangedLeadingLines: start, unchangedTrailingLines: end, message: 'Save a new draft file only. The opened manifest and lock will remain unchanged.' };
  }
  function saveDraft(input) {
    if (!input || Object.keys(input).length !== 1 || typeof input.token !== 'string') throw new Error('Draft save accepts a reviewed token only; filesystem targets are fixed');
    const review = reviews.get(input.token); if (!review || review.expires < Date.now()) throw new Error('Review expired or already saved; review the draft again');
    unchanged(baseHash);
    // Refuse symlink/junction parents, then create only fixed project-local directories.
    let parent = realpathSync(directory);
    for (const name of ['.ramp', 'drafts']) {
      parent = join(parent, name);
      try { if (lstatSync(parent).isSymbolicLink() || !lstatSync(parent).isDirectory()) throw new Error('Draft directory must be a real project-local directory'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; mkdirSync(parent); }
    }
    writeFileSync(join(directory, review.path), review.raw, { encoding: 'utf8', flag: 'wx' });
    reviews.delete(input.token);
    return { path: review.path, hash: sha256(Buffer.from(review.raw)), message: 'Draft saved. The opened manifest and lock were not changed.' };
  }
  return { catalog, validate, archive, draftPreview, saveDraft };
}
