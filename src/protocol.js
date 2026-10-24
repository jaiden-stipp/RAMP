import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSchema, DiagnosticError, diagnostic, diagnosticsOf } from './validation.js';
import { resolveModuleFile } from './module-loader.js';

export const PROTOCOL_VERSION = '0.1.0';
export const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const kinds = ['roles', 'methods', 'personas', 'outputs'];
const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const modulePattern = /^(roles|methods|personas|outputs)\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const capabilityPattern = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/;

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function object(value, keys, label) {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  for (const key of keys) requireThat(Object.hasOwn(value, key), `${label}.${key} is required`);
  for (const key of Object.keys(value)) requireThat(keys.includes(key), `${label}.${key} is unknown`);
}

function string(value, label, pattern) {
  requireThat(typeof value === 'string' && value.trim().length > 0, `${label} must be a nonempty string`);
  if (pattern) requireThat(pattern.test(value), `${label} has an invalid format`);
}

function strings(value, label, pattern, minimum = 0) {
  requireThat(Array.isArray(value) && value.length >= minimum, `${label} must be an array with at least ${minimum} entries`);
  value.forEach((item, index) => string(item, `${label}[${index}]`, pattern));
  requireThat(new Set(value).size === value.length, `${label} contains duplicates`);
}

function version(value, label) {
  requireThat(value === PROTOCOL_VERSION, `${label} must be ${PROTOCOL_VERSION}`);
}

export function validateManifest(manifest, file = '<manifest>') {
  assertSchema('project', manifest, file);
  object(manifest, ['protocolVersion', 'project', 'agents'], 'manifest');
  version(manifest.protocolVersion, 'manifest.protocolVersion');
  const p = manifest.project;
  object(p, ['id', 'title', 'question', 'scope', 'exclusions', 'allowedCapabilities', 'limits', 'stopConditions'], 'project');
  string(p.id, 'project.id', idPattern);
  string(p.title, 'project.title');
  string(p.question, 'project.question');
  strings(p.scope, 'project.scope', undefined, 1);
  strings(p.exclusions, 'project.exclusions');
  strings(p.allowedCapabilities, 'project.allowedCapabilities', capabilityPattern);
  strings(p.stopConditions, 'project.stopConditions', undefined, 1);
  object(p.limits, ['maxSources', 'maxIterations'], 'project.limits');
  for (const [key, value] of Object.entries(p.limits)) {
    requireThat(Number.isSafeInteger(value) && value > 0, `project.limits.${key} must be a positive safe integer`);
  }
  requireThat(Array.isArray(manifest.agents) && manifest.agents.length > 0, 'agents must be a nonempty array');
  const agentIds = new Set();
  for (const agent of manifest.agents) {
    object(agent, ['id', 'modules'], 'agent');
    string(agent.id, 'agent.id', idPattern);
    requireThat(!agentIds.has(agent.id), `Duplicate agent ID: ${agent.id}`);
    agentIds.add(agent.id);
    strings(agent.modules, `agent ${agent.id}.modules`, modulePattern, 1);
  }
  return manifest;
}

export function validateModule(module, expectedId, file = '<module>') {
  assertSchema('module', module, file);
  object(module, ['id', 'version', 'protocolVersion', 'kind', 'summary', 'instructions', 'requires', 'excludes', 'capabilities'], 'module');
  string(module.id, 'module.id', modulePattern);
  requireThat(module.id === expectedId, `Module ID mismatch: expected ${expectedId}, got ${module.id}`);
  string(module.version, `${module.id}.version`, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  version(module.protocolVersion, `${module.id}.protocolVersion`);
  requireThat(kinds.includes(module.kind) && module.id.startsWith(`${module.kind}/`), `${module.id}: kind does not match ID`);
  string(module.summary, `${module.id}.summary`);
  strings(module.instructions, `${module.id}.instructions`, undefined, 1);
  strings(module.requires, `${module.id}.requires`, modulePattern);
  strings(module.excludes, `${module.id}.excludes`, modulePattern);
  strings(module.capabilities, `${module.id}.capabilities`, capabilityPattern);
  requireThat(!module.requires.includes(module.id) && !module.excludes.includes(module.id), `${module.id}: self-reference is invalid`);
  requireThat(!module.requires.some(id => module.excludes.includes(id)), `${module.id}: a dependency is also excluded`);
  requireThat(module.kind !== 'personas' || module.capabilities.length === 0, `${module.id}: personas cannot require capabilities`);
  return module;
}

export function validateAgent(agent, modules, allowedCapabilities) {
  const selected = new Set(agent.modules);
  const counts = Object.fromEntries(kinds.map(kind => [kind, 0]));
  for (const module of modules) {
    counts[module.kind]++;
    for (const required of module.requires) {
      requireThat(selected.has(required), `Agent ${agent.id}: ${module.id} requires ${required}`);
    }
    for (const excluded of module.excludes) {
      requireThat(!selected.has(excluded), `Agent ${agent.id}: ${module.id} excludes ${excluded}`);
    }
    for (const capability of module.capabilities) {
      requireThat(allowedCapabilities.includes(capability), `Agent ${agent.id}: ${module.id} requires forbidden capability ${capability}`);
    }
  }
  requireThat(counts.roles === 1, `Agent ${agent.id} must select exactly one role`);
  requireThat(counts.personas <= 1, `Agent ${agent.id} may select at most one persona`);
  requireThat(counts.outputs <= 1, `Agent ${agent.id} may select at most one output module`);
}

export function sha256(content) {
  const normalized = typeof content === 'string' ? content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n') : content;
  return createHash('sha256').update(normalized).digest('hex');
}

export function readJson(path) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); }
  catch (error) { throw new DiagnosticError([diagnostic('FILE_READ', error.message, path)]); }
  try {
    return { raw, value: JSON.parse(raw.replace(/^\uFEFF/, '')) };
  } catch (error) {
    throw new DiagnosticError([diagnostic('JSON_SYNTAX', `Invalid JSON: ${error.message}`, path)]);
  }
}

export function loadProject(manifestPath, root = REPO_ROOT) {
  const { raw, value: manifest } = readJson(manifestPath);
  return loadProjectData(manifest, { manifestPath, root, raw });
}

// In-memory authors use exactly the CLI's schema, module resolution and semantic checks.
export function loadProjectData(manifest, { manifestPath, root = REPO_ROOT, raw = `${JSON.stringify(manifest, null, 2)}\n` }) {
  try { validateManifest(manifest, manifestPath); }
  catch (error) { throw new DiagnosticError(diagnosticsOf(error, manifestPath)); }
  const moduleRoot = realpathSync(join(root, 'modules'));
  const cache = new Map();
  const errors = [];
  const agents = manifest.agents.map((agent, agentIndex) => {
    const modules = agent.modules.map(id => {
      const candidate = join(moduleRoot, `${id}.json`);
      try {
      if (!cache.has(id)) {
        const { path, origin } = resolveModuleFile(id, root, dirname(manifestPath));
        const loaded = readJson(path);
        cache.set(id, { ...validateModule(loaded.value, id, path), hash: sha256(loaded.raw), origin, sourcePath: path });
      }
      return cache.get(id);
      } catch (error) { errors.push(...diagnosticsOf(error, candidate)); return null; }
    }).filter(Boolean);
    if (modules.length === agent.modules.length) {
      try { validateAgent(agent, modules, manifest.project.allowedCapabilities); }
      catch (error) { errors.push(...diagnosticsOf(error, manifestPath, `/agents/${agentIndex}/modules`)); }
    }
    return { ...agent, modules };
  });
  if (errors.length) throw new DiagnosticError(errors);
  const core = readFileSync(join(root, 'spec', 'CORE.md'), 'utf8');
  return { manifest, manifestHash: sha256(raw), core, coreHash: sha256(core), agents, repositoryRoot: root };
}

export function configureAgent(project, agentId, ids, projectDirectory) {
  const manifest = structuredClone(project.manifest);
  const agent = manifest.agents.find(a => a.id === agentId);
  requireThat(agent, `Unknown destination agent: ${agentId}`);
  agent.modules = ids;
  validateManifest(manifest);
  const modules = ids.map(id => {
    const { path, origin } = resolveModuleFile(id, project.repositoryRoot ?? REPO_ROOT, projectDirectory);
    const loaded = readJson(path);
    return { ...validateModule(loaded.value, id, path), origin, sourcePath: path, hash: sha256(loaded.raw) };
  });
  validateAgent(agent, modules, manifest.project.allowedCapabilities);
  return { ...project, manifest, manifestHash: sha256(JSON.stringify(manifest)), agents: project.agents.map(a => a.id === agentId ? { id: agentId, modules } : a) };
}

export function compose(project, agentId) {
  const agents = agentId === undefined ? project.agents : project.agents.filter(agent => agent.id === agentId);
  requireThat(agents.length > 0, `Unknown agent: ${agentId}. Available agents: ${project.agents.map(a => a.id).join(', ')}`);
  const p = project.manifest.project;
  const lines = [
    '# RAMP research agent instructions', '',
    `Protocol: ${PROTOCOL_VERSION}`, '',
    'This bundle supplies instructions, not a running or sandboxed agent. The host/operator enforces tools, budgets, phase gates, and review.', '',
    '## Configuration provenance', '',
    `- Manifest SHA-256: ${project.manifestHash}`,
    `- Core SHA-256: ${project.coreHash}`, '',
    '## Shared core', '', project.core.trim(), '',
    '## Project charter', '',
    `Project: ${p.id} — ${p.title}`, '',
    `Research question: ${p.question}`, '',
    '### Scope', ...p.scope.map(item => `- ${item}`), '',
    '### Exclusions', ...(p.exclusions.length ? p.exclusions.map(item => `- ${item}`) : ['None declared.']), '',
    '### Permission ceiling', '',
    ...(p.allowedCapabilities.length ? p.allowedCapabilities.map(item => `- ${item}`) : ['No capabilities declared.']), '',
    'Capabilities still require host authorization and concrete tool/destination mappings.', '',
    `Shared limits: ${p.limits.maxSources} sources; ${p.limits.maxIterations} research iterations.`, '',
    '### Stop and completion conditions', '', ...p.stopConditions.map(item => `- ${item}`), ''
  ];
  for (const agent of agents) {
    lines.push(`## Agent: ${agent.id}`, '', 'Apply the shared core and charter plus the following modules. Preserve evidence and record a handoff before changing this configuration.', '');
    for (const module of agent.modules) {
      lines.push(`### ${module.id} @ ${module.version}`, '', module.summary, '', `Origin: ${module.origin}`, '', `SHA-256: ${module.hash}`, '', ...module.instructions.map(item => `- ${item}`), '');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
