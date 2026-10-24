import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from '../src/protocol.js';

test('packed local install exposes ramp outside checkout and projects survive moving paths with spaces', t => {
  const dir = mkdtempSync(join(tmpdir(), 'ramp package ')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const npmPath = process.env.npm_execpath;
  assert.ok(npmPath, 'Run this installation test through npm test');
  const npm = (cwd, ...args) => { const r = spawnSync(process.execPath, [npmPath, ...args], { cwd, encoding: 'utf8', timeout: 60000 }); assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}\n${r.error ?? ''}`); return r.stdout; };
  const packed = JSON.parse(npm(REPO_ROOT, 'pack', '--json', '--ignore-scripts', '--pack-destination', dir));
  const install = join(dir, 'clean installation'); mkdirSync(install);
  npm(install, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', join(dir, packed[0].filename));
  const command = (...args) => npm(install, 'exec', '--offline', '--', 'ramp', ...args);
  const project = join(dir, 'first research'); command('init', project);
  const instructions = readFileSync(join(project, 'README.md'), 'utf8');
  assert.ok(!instructions.includes(REPO_ROOT) && !instructions.includes('src/cli.js'));
  assert.match(instructions, /ramp validate ramp.json --locked/);
  command('validate', join(project, 'ramp.json')); command('lock', join(project, 'ramp.json'));
  const moved = join(dir, 'moved research'); renameSync(project, moved);
  command('validate', join(moved, 'ramp.json'), '--locked');
  assert.match(command('compose', join(moved, 'ramp.json'), '--locked', '--agent', 'scout'), /## Agent: scout/);
});
