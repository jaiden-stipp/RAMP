import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, compose, loadProject, validateAgent, validateManifest, validateModule } from '../src/protocol.js';

const examplePath = join(REPO_ROOT, 'examples', 'literature-review', 'ramp.json');
const manifest = () => JSON.parse(readFileSync(examplePath, 'utf8'));
const moduleFile = id => JSON.parse(readFileSync(join(REPO_ROOT, 'modules', `${id}.json`), 'utf8'));
const selection = ids => ({ id: 'test-agent', modules: ids });
const checkSelection = ids => validateAgent(selection(ids), ids.map(moduleFile), ['source.read', 'artifact.write']);

test('sample composes all four agents with core, charter, and content provenance', () => {
  const project = loadProject(examplePath);
  const output = compose(project);
  assert.equal(project.agents.length, 4);
  assert.ok(output.includes(project.core.trim()));
  assert.ok(output.includes(project.manifest.project.question));
  assert.ok(output.includes(`Manifest SHA-256: ${project.manifestHash}`));
  for (const agent of project.agents) {
    assert.ok(output.includes(`## Agent: ${agent.id}`));
    for (const module of agent.modules) assert.ok(output.includes(module.hash));
  }
  assert.equal(compose(loadProject(examplePath)), output);
});

test('missing dependency fails instead of silently enabling a method', () => {
  assert.throws(() => checkSelection(['roles/scout']), /requires methods\/evidence-first/);
});

test('declaring a required capability cannot exceed the charter ceiling', () => {
  const ids = ['roles/scout', 'methods/evidence-first'];
  assert.throws(() => validateAgent(selection(ids), ids.map(moduleFile), ['source.read']), /forbidden capability artifact.write/);
});

test('one-sided exclusions fail in either selection order', () => {
  const role = moduleFile('roles/scout');
  const method = moduleFile('methods/evidence-first');
  const persona = moduleFile('personas/calm-guide');
  persona.excludes = ['roles/scout'];
  for (const modules of [[role, method, persona], [persona, method, role]]) {
    assert.throws(() => validateAgent(selection(modules.map(m => m.id)), modules, ['source.read', 'artifact.write']), /excludes roles\/scout/);
  }
});

test('configuration requires exactly one role', () => {
  assert.throws(() => checkSelection(['methods/evidence-first']), /exactly one role/);
  assert.throws(() => checkSelection(['roles/scout', 'roles/analyst', 'methods/evidence-first']), /exactly one role/);
});

test('multiple personas or outputs are ambiguous and rejected', () => {
  const base = ['roles/scout', 'methods/evidence-first'].map(moduleFile);
  for (const id of ['personas/calm-guide', 'outputs/research-brief']) {
    const first = moduleFile(id);
    const second = { ...first, id: `${first.kind}/another` };
    const modules = [...base, first, second];
    assert.throws(() => validateAgent(selection(modules.map(m => m.id)), modules, ['source.read', 'artifact.write']), /at most one/);
  }
});

test('a persona cannot acquire capabilities', () => {
  const persona = moduleFile('personas/calm-guide');
  persona.capabilities = ['source.read'];
  assert.throws(() => validateModule(persona, persona.id), /personas cannot require capabilities/);
});

test('unsupported project and module protocol versions fail', () => {
  const p = manifest();
  p.protocolVersion = '9.0.0';
  assert.throws(() => validateManifest(p), /must be 0.1.0/);
  const m = moduleFile('roles/scout');
  m.protocolVersion = '9.0.0';
  assert.throws(() => validateModule(m, m.id), /must be 0.1.0/);
});

test('unknown fields catch typos instead of weakening project limits', () => {
  const p = manifest();
  p.project.limits.maxSource = 100;
  assert.throws(() => validateManifest(p), /maxSource is unknown/);
});

test('project budgets reject zero, fractions, and unsafe integers', () => {
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const p = manifest();
    p.project.limits.maxSources = value;
    assert.throws(() => validateManifest(p), /positive safe integer/);
  }
});

test('agent IDs and module selections cannot be duplicated', () => {
  const p = manifest();
  p.agents.push(structuredClone(p.agents[0]));
  assert.throws(() => validateManifest(p), /Duplicate agent ID/);
  const q = manifest();
  q.agents[0].modules.push(q.agents[0].modules[0]);
  assert.throws(() => validateManifest(q), /contains duplicates/);
});

test('module IDs reject traversal and absolute paths before file access', () => {
  for (const id of ['../secret', 'roles/../../secret', 'C:\\secret', '/secret', 'roles/scout.json']) {
    const p = manifest();
    p.agents[0].modules[0] = id;
    assert.throws(() => validateManifest(p), /invalid format/);
  }
});

test('module contract catches file/ID mismatches and contradictory dependencies', () => {
  const m = moduleFile('roles/scout');
  assert.throws(() => validateModule(m, 'roles/analyst'), /ID mismatch/);
  m.excludes = ['methods/evidence-first'];
  assert.throws(() => validateModule(m, m.id), /dependency is also excluded/);
});

test('a module cannot depend on or exclude itself', () => {
  for (const key of ['requires', 'excludes']) {
    const m = moduleFile('roles/scout');
    m[key] = [m.id];
    assert.throws(() => validateModule(m, m.id), /self-reference/);
  }
});

test('module content changes change provenance in composed output', () => {
  const project = loadProject(examplePath);
  const before = compose(project);
  project.agents[0].modules[0] = { ...project.agents[0].modules[0], hash: 'changed-content-hash' };
  assert.notEqual(compose(project), before);
});

test('CLI validates and composes the example from outside the repository', () => {
  for (const command of ['validate', 'compose']) {
    const result = spawnSync(process.execPath, [join(REPO_ROOT, 'src/cli.js'), command, examplePath], { cwd: process.env.TEMP || REPO_ROOT, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, command === 'validate' ? /Valid RAMP project/ : /# RAMP research agent instructions/);
  }
});

test('CLI rejects malformed options and prevents replacing the manifest', () => {
  const cli = join(REPO_ROOT, 'src/cli.js');
  for (const args of [[], ['run', examplePath], ['validate', examplePath, '--out', 'file.md'], ['compose', examplePath, '--unknown'], ['compose', examplePath, '--out', examplePath]]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /RAMP:/);
  }
});
