import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { DiagnosticError, diagnostic } from './validation.js';

export function contained(root, target) {
  const local = relative(root, target);
  return local !== '..' && !local.startsWith('..\\') && !local.startsWith('../') && !isAbsolute(local);
}

function present(path) {
  try { lstatSync(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export function moduleRoots(repositoryRoot, projectDirectory) {
  const projectRoot = realpathSync(projectDirectory);
  const builtinRoot = realpathSync(join(repositoryRoot, 'modules'));
  const localCandidateRoot = join(projectRoot, 'modules');
  const roots = [{ path: builtinRoot, origin: 'builtin' }];
  if (present(localCandidateRoot)) {
    const localRoot = realpathSync(localCandidateRoot);
    if (!contained(projectRoot, localRoot)) throw new DiagnosticError([diagnostic('MODULE_ROOT_ESCAPE', 'Project modules directory resolves outside the project', localCandidateRoot)]);
    if (localRoot !== builtinRoot) roots.push({ path: localRoot, origin: 'project' });
  }
  return roots;
}

export function resolveModuleFile(id, repositoryRoot, projectDirectory) {
  const projectRoot = realpathSync(projectDirectory);
  const roots = moduleRoots(repositoryRoot, projectDirectory);
  const matches = roots.map(root => ({ ...root, file: join(root.path, `${id}.json`) })).filter(root => present(root.file));
  if (!matches.length) throw new DiagnosticError([diagnostic('MODULE_NOT_FOUND', `Module ${id} not found in built-in or project modules`, join(projectRoot, 'ramp.json'))]);
  if (matches.length > 1) throw new DiagnosticError([diagnostic('MODULE_AMBIGUOUS', `Duplicate module ID ${id}: ${matches.map(m => m.file).join(', ')}`, matches[1].file)]);
  const match = matches[0];
  const path = realpathSync(match.file);
  if (!contained(match.path, path)) throw new DiagnosticError([diagnostic('MODULE_PATH_ESCAPE', `Module ${id} resolves outside approved module directory`, match.file)]);
  return { path, origin: `${match.origin}:${match.origin === 'project' ? 'modules/' : ''}${id}.json` };
}
