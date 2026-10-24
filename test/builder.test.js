import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { get } from 'node:http';
import { unzipSync, strFromU8 } from 'fflate';
import { createBuilderServer } from '../src/builder/server.js';
import { createBuilderService } from '../src/builder/service.js';
import { REPO_ROOT, readJson, loadProject, compose } from '../src/protocol.js';
import { assertLocked } from '../src/lockfile.js';

const sample = join(REPO_ROOT, 'examples/literature-review/ramp.json');
const manifest = () => structuredClone(readJson(sample).value);
function workspace(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ramp-builder-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'ramp.json'), JSON.stringify(manifest()));
  return dir;
}
function localModule(dir, name, extra = {}) {
  mkdirSync(join(dir, 'modules/methods'), { recursive: true });
  writeFileSync(join(dir, `modules/methods/${name}.json`), JSON.stringify({
    id: `methods/${name}`, kind: 'methods', version: '0.1.0', protocolVersion: '0.1.0',
    summary: 'A custom project method.', instructions: ['Preserve the test evidence.'], requires: [], excludes: [], capabilities: [], ...extra
  }));
}
async function serve(t, path) {
  const server = createBuilderServer(path);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (route, value, headers = {}) => fetch(url + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url, ...headers }, body: JSON.stringify(value) });
  return { url, post };
}

test('builder exports a portable locked project and per-agent bundles with selected local modules', async t => {
  const dir = workspace(t); localModule(dir, 'custom');
  const { url, post } = await serve(t, join(dir, 'ramp.json'));
  const catalog = await (await fetch(url + '/api/catalog')).json();
  assert.ok(catalog.modules.some(m => m.id === 'methods/custom' && m.origin === 'project:modules/methods/custom.json'));
  assert.ok(catalog.modules.every(m => !('sourcePath' in m)));
  const next = manifest(); next.agents[0].modules.push('methods/custom');
  const validation = await (await post('/api/validate', { manifest: next })).json();
  assert.equal(validation.valid, true); assert.equal(validation.previews.length, 4);
  const response = await post('/api/export', { manifest: next }); assert.equal(response.status, 200);
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  assert.ok(files['instructions/agents/scout.md']); assert.ok(files['instructions/all-agents.md']);
  assert.ok(files['modules/methods/custom.json']);
  const out = join(dir, 'export'); mkdirSync(out);
  for (const [name, contents] of Object.entries(files)) { const path = join(out, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, contents); }
  const project = loadProject(join(out, 'ramp.json')); assertLocked(project, join(out, 'ramp.lock.json'));
  assert.equal(compose(project), strFromU8(files['instructions/all-agents.md']));
  const cli = spawnSync(process.execPath, ['src/cli.js', 'validate', join(out, 'ramp.json'), '--locked'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  const composed = spawnSync(process.execPath, ['src/cli.js', 'compose', join(out, 'ramp.json'), '--locked', '--agent', 'scout'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(composed.status, 0, composed.stderr); assert.equal(composed.stdout, strFromU8(files['instructions/agents/scout.md']));
  assert.equal(readFileSync(join(dir, 'ramp.json'), 'utf8'), JSON.stringify(manifest()), 'builder never writes the opened project');
});

test('builder uses CLI diagnostics and blocks role, dependency, conflict and capability errors at export', async t => {
  const dir = workspace(t); localModule(dir, 'conflicting', { excludes: ['methods/evidence-first'] });
  const { post } = await serve(t, join(dir, 'ramp.json'));
  const variants = [
    [m => { m.agents[0].modules = ['methods/evidence-first']; }, /exactly one role/],
    [m => m.agents[0].modules.push('roles/analyst'), /exactly one role/],
    [m => { m.agents[0].modules = ['roles/scout']; }, /requires methods\/evidence-first/],
    [m => m.agents[0].modules.push('methods/conflicting'), /excludes/],
    [m => { m.project.allowedCapabilities = []; }, /forbidden capability/],
    [m => m.agents[0].modules.push('personas/teaching-guide'), /at most one persona/],
    [m => { m.project.id = '../escape'; }, /invalid format/],
    [m => { m.agents = []; }, /fewer than 1/]
  ];
  for (const [change, pattern] of variants) {
    const next = manifest(); change(next);
    const checked = await post('/api/validate', { manifest: next }); assert.equal(checked.status, 422);
    const body = await checked.json(); assert.equal(body.valid, false);
    assert.ok(body.diagnostics.some(d => pattern.test(d.message)), JSON.stringify(body));
    assert.ok(body.diagnostics.every(d => d.code && typeof d.path === 'string'));
    const exported = await post('/api/export', { manifest: next }); assert.equal(exported.status, 422);
    assert.ok(!exported.headers.get('content-type').includes('zip'));
  }
});

test('builder persona swaps preserve core and permission ceiling and expose changes', t => {
  const dir = workspace(t); const service = createBuilderService(join(dir, 'ramp.json'));
  assert.deepEqual(service.validate(manifest()).changes, []);
  const next = manifest(); next.agents[0].modules = next.agents[0].modules.filter(m => !m.startsWith('personas/')).concat('personas/teaching-guide');
  const result = service.validate(next); assert.equal(result.valid, true);
  assert.ok(result.changes.some(c => c.kind === 'module-added' && c.id === 'personas/teaching-guide'));
  assert.ok(result.changes.some(c => c.kind === 'module-removed' && c.id === 'personas/calm-guide') === false, 'other agents still select calm-guide');
  assert.ok(result.changes.some(c => c.kind === 'agents'));
  assert.equal(result.lock.coreHash, service.validate(manifest()).lock.coreHash);
  assert.ok(result.previews.every(p => p.instructions.includes(service.catalog().core.trim())));
  assert.deepEqual(next.project.allowedCapabilities, manifest().project.allowedCapabilities);
});

test('builder restricts HTTP to same-origin JSON, known assets and bounded bodies', async t => {
  const { url, post } = await serve(t, sample);
  assert.equal((await post('/api/export', { manifest: manifest() }, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await post('/api/validate', {}, { 'Content-Type': 'text/plain' })).status, 403);
  const foreignHost = await new Promise((resolve, reject) => get(url + '/api/catalog', { headers: { Host: 'untrusted.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject));
  assert.equal(foreignHost, 403);
  assert.equal((await fetch(url + '/src/protocol.js')).status, 404);
  assert.equal((await post('/api/validate', { padding: 'x'.repeat(1024 * 1024) })).status, 413);
  const broken = await fetch(url + '/api/validate', { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json' }, body: '{' }); assert.equal(broken.status, 400);
  assert.equal((await post('/api/validate', {})).status, 422);
  const page = await fetch(url); const html = await page.text();
  assert.match(page.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.match(html, /aria-live="polite"/); assert.match(html, /Skip to configuration/);
  assert.doesNotMatch(html, /<script[^>]+https?:/);
});
