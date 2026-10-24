import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from '../src/protocol.js';
import { initializeProject } from '../src/scaffold.js';
import { loadProject, sha256 } from '../src/protocol.js';
import { assertLocked, configurationLock, compareLock, lockPath, writeLock } from '../src/lockfile.js';

function fixture() {
  const parent = mkdtempSync(join(tmpdir(), 'ramp-lock-')); const dir = join(parent, 'project'); initializeProject(dir);
  const file = join(dir, 'ramp.json'); mkdirSync(join(dir, 'modules/methods'), { recursive: true });
  const modulePath = join(dir, 'modules/methods/local.json');
  const module = { id: 'methods/local', version: '0.1.0', protocolVersion: '0.1.0', kind: 'methods', summary: 'Local', instructions: ['Review the source.'], requires: [], excludes: [], capabilities: [] };
  writeFileSync(modulePath, JSON.stringify(module));
  const m = JSON.parse(readFileSync(file, 'utf8')); m.agents[0].modules.push(module.id); writeFileSync(file, JSON.stringify(m, null, 2) + '\n');
  return { dir, file, module, modulePath };
}
test('same-version edits fail locked mode, produce field previews, and require explicit lock refresh', () => {
  const f = fixture(); const path = lockPath(f.file); const initial = loadProject(f.file); writeLock(initial, path);
  assertLocked(initial, path); const before = readFileSync(path, 'utf8');
  f.module.instructions = ['Review the source and retain contradictions.']; writeFileSync(f.modulePath, JSON.stringify(f.module));
  const changed = loadProject(f.file);
  assert.throws(() => assertLocked(changed, path), /Configuration differs/);
  const diff = compareLock(JSON.parse(before), changed);
  assert.ok(diff.some(d => d.id === 'methods/local' && d.changedFields.includes('instructions')));
  assert.equal(readFileSync(path, 'utf8'), before);
  assert.throws(() => writeLock(changed, path), /EEXIST/);
  writeLock(changed, path, true); assertLocked(changed, path);
});
test('normalized UTF-8 hashes and locks are portable across LF/CRLF and have no absolute paths or instruction payloads', () => {
  const f = fixture(); const p = loadProject(f.file); const lock = configurationLock(p);
  assert.equal(sha256('\uFEFFa\r\nb\r'), sha256('a\nb\n'));
  const lf = readFileSync(f.file, 'utf8'); writeFileSync(f.file, '\uFEFF' + lf.replaceAll('\n', '\r\n'));
  assert.deepEqual(configurationLock(loadProject(f.file)), lock);
  const rendered = JSON.stringify(lock);
  assert.ok(!rendered.includes(f.dir)); assert.ok(!rendered.includes(f.module.instructions[0]));
  const modified = structuredClone(lock); modified.agents[0].modules.reverse();
  assert.ok(compareLock(modified, p).some(d => d.kind === 'agents'));
  const otherCore = { ...p, coreHash: 'changed' }; assert.ok(compareLock(lock, otherCore).some(d => d.kind === 'coreHash'));
});
test('CLI locked validation/composition and read-only comparison work without implicit refresh', () => {
  const f = fixture();
  const cli = (...args) => spawnSync(process.execPath, [join(REPO_ROOT, 'src/cli.js'), ...args], { encoding: 'utf8' });
  assert.equal(cli('validate', f.file, '--json', '--locked').status, 1);
  assert.equal(cli('lock', f.file).status, 0);
  assert.equal(cli('compose', f.file, '--agent', 'scout', '--locked').status, 0);
  const before = readFileSync(lockPath(f.file), 'utf8');
  f.module.capabilities = ['source.read']; writeFileSync(f.modulePath, JSON.stringify(f.module));
  assert.equal(JSON.parse(cli('validate', f.file, '--json', '--locked').stdout).diagnostics[0].code, 'LOCK_MISMATCH');
  assert.ok(JSON.parse(cli('diff', f.file).stdout).changes.some(c => c.changedFields?.includes('capabilities')));
  assert.equal(readFileSync(lockPath(f.file), 'utf8'), before);
  assert.equal(cli('compose', f.file).status, 0);
  assert.equal(cli('lock', f.file, '--update').status, 0);
  assert.equal(cli('validate', f.file, '--locked').status, 0);
});
