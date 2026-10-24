import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, loadProject, compose } from '../src/protocol.js';
import { initializeProject } from '../src/scaffold.js';
const cli = (...args) => spawnSync(process.execPath, [join(REPO_ROOT, 'src/cli.js'), ...args], { encoding: 'utf8', cwd: tmpdir() });

test('external project in a path with spaces initializes, validates, and exports independent instructions', () => {
  const parent = mkdtempSync(join(tmpdir(), 'ramp setup '));
  const directory = join(parent, 'my research');
  assert.equal(cli('init', directory).status, 0);
  const manifest = join(directory, 'ramp.json');
  assert.equal(cli('validate', manifest).status, 0);
  const p = loadProject(manifest);
  const one = cli('compose', manifest, '--agent', 'reviewer');
  assert.equal(one.status, 0, one.stderr);
  assert.ok(one.stdout.includes(p.core.trim()));
  assert.ok(one.stdout.includes(p.manifestHash));
  assert.ok(one.stdout.includes(p.manifest.project.question));
  assert.ok(one.stdout.includes('## Agent: reviewer'));
  assert.ok(!one.stdout.includes('## Agent: scout'));
  assert.ok(!one.stdout.includes('### roles/scout'));
  assert.equal(cli('compose', manifest, '--out', join(directory, 'all agents.md')).status, 0);
  assert.match(readFileSync(join(directory, 'all agents.md'), 'utf8'), /## Agent: scout/);
  assert.equal(cli('compose', manifest, '--out', join(directory, 'all agents.md')).status, 1);
  assert.match(cli('compose', manifest, '--agent', 'missing').stderr, /Unknown agent.*Available agents/);
  assert.throws(() => compose(p, 'missing'), /Unknown agent/);
});
test('init refuses existing populated and empty directories without changing contents', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ramp-existing-'));
  writeFileSync(join(dir, 'ramp.json'), 'preserve me');
  assert.throws(() => initializeProject(dir), /EEXIST/);
  assert.equal(readFileSync(join(dir, 'ramp.json'), 'utf8'), 'preserve me');
  assert.deepEqual(readdirSync(dir), ['ramp.json']);
  const empty = join(dir, 'empty'); mkdirSync(empty);
  assert.throws(() => initializeProject(empty), /EEXIST/);
  assert.deepEqual(readdirSync(empty), []);
});
test('help and malformed options have consistent exit behavior', () => {
  assert.equal(cli('--help').status, 0);
  assert.match(cli('--help').stdout, /--agent/);
  for (const args of [['init'], ['compose', 'x', '--agent'], ['validate', 'x', '--agent', 'a'], ['init', 'x', '--json']]) assert.equal(cli(...args).status, 1);
});
