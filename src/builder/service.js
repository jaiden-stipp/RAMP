import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { REPO_ROOT, readJson, loadProjectData, validateModule, compose } from '../protocol.js';
import { moduleRoots, resolveModuleFile } from '../module-loader.js';
import { configurationLock, compareLock } from '../lockfile.js';
import { diagnosticsOf } from '../validation.js';

const json = value => `${JSON.stringify(value, null, 2)}\n`;

export function createBuilderService(manifestPath, root = REPO_ROOT) {
  const initial = readJson(manifestPath).value;
  const directory = dirname(manifestPath);
  const baseline = configurationLock(loadProjectData(initial, { manifestPath, root }));

  function catalog() {
    const modules = []; const diagnostics = []; const seen = new Set();
    for (const location of moduleRoots(root, directory)) {
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
    return { manifest: initial, modules, diagnostics, core: readFileSync(join(root, 'spec', 'CORE.md'), 'utf8') };
  }

  function projectFor(manifest) { return loadProjectData(manifest, { manifestPath, root }); }

  function validate(manifest) {
    try {
      const project = projectFor(manifest);
      return { valid: true, diagnostics: [], changes: compareLock(baseline, project),
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
  return { catalog, validate, archive };
}
