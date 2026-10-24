import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT, readJson } from '../src/protocol.js';
import { createBuilderService } from '../src/builder/service.js';
import { createBuilderServer } from '../src/builder/server.js';
const sample = () => structuredClone(readJson(join(REPO_ROOT, 'examples/literature-review/ramp.json')).value);
function setup(t, content) { const dir = mkdtempSync(join(tmpdir(), 'ramp recover ')); t.after(() => rmSync(dir, { recursive: true, force: true })); const path = join(dir, 'ramp.json'); writeFileSync(path, content); return { dir, path, service: createBuilderService(path) }; }

test('invalid/malformed projects open with diagnostics and recover through the shared validator', t => {
  for (const change of [m => { m.agents[0].modules = ['methods/evidence-first']; }, m => { m.agents[0].modules = ['roles/scout']; }, m => { m.project.allowedCapabilities = []; }]) {
    const m = sample(); change(m); const f = setup(t, JSON.stringify(m)); const catalog = f.service.catalog(); assert.ok(catalog.initialDiagnostics.length); assert.ok(catalog.modules.length); assert.equal(f.service.validate(m).valid, false); assert.equal(f.service.validate(sample()).valid, true); assert.ok(f.service.archive(sample()).length);
  }
  const malformed = setup(t, '{"project":'); const catalog = malformed.service.catalog(); assert.equal(catalog.manifest, null); assert.match(catalog.initialDiagnostics[0].code, /JSON/); assert.equal(catalog.raw, '{"project":');
  const review = malformed.service.draftPreview({ raw: JSON.stringify(sample()), baseHash: catalog.baseHash }); assert.match(review.diff, /project/);
  const saved = malformed.service.saveDraft({ token: review.token }); assert.deepEqual(JSON.parse(readFileSync(join(malformed.dir, saved.path))), sample()); assert.equal(readFileSync(malformed.path, 'utf8'), '{"project":');
});
test('reviewed draft writes are exclusive, preserve manifest/lock, reject disk conflicts and arbitrary targets', t => {
  const f = setup(t, JSON.stringify(sample())); const original = readFileSync(f.path, 'utf8'); writeFileSync(join(f.dir, 'ramp.lock.json'), 'untouched lock'); const baseHash = f.service.catalog().baseHash;
  assert.throws(() => f.service.saveDraft({ token: 'absent', path: '../escape' }), /token only/);
  assert.throws(() => f.service.draftPreview({ raw: '{}', baseHash, path: '../escape' }), /targets are fixed/);
  const review = f.service.draftPreview({ raw: '{ recovery draft', baseHash }); assert.match(review.path, /^\.ramp\/drafts\/[a-f0-9-]+\.json$/);
  const saved = f.service.saveDraft({ token: review.token }); assert.equal(readFileSync(join(f.dir, saved.path), 'utf8'), '{ recovery draft');
  assert.equal(readFileSync(f.path, 'utf8'), original); assert.equal(readFileSync(join(f.dir, 'ramp.lock.json'), 'utf8'), 'untouched lock'); assert.throws(() => f.service.saveDraft({ token: review.token }), /already saved/);
  const pending = f.service.draftPreview({ raw: '{}', baseHash }); writeFileSync(f.path, original + ' ');
  assert.throws(() => f.service.saveDraft({ token: pending.token }), /changed on disk/); assert.equal(readdirSync(join(f.dir, '.ramp/drafts')).length, 1);
});
test('draft save rejects escaping junction parents and retains same-origin/body security', async t => {
  const f = setup(t, JSON.stringify(sample())); const outside = mkdtempSync(join(tmpdir(), 'ramp outside ')); t.after(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(outside, join(f.dir, '.ramp'), process.platform === 'win32' ? 'junction' : 'dir');
  const review = f.service.draftPreview({ raw: '{}', baseHash: f.service.catalog().baseHash }); assert.throws(() => f.service.saveDraft({ token: review.token }), /real project-local/); assert.deepEqual(readdirSync(outside), []);
  const server = createBuilderServer(f.path); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(url + '/api/draft-preview', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://other.invalid' }, body: '{}' }); assert.equal(response.status, 403);
  const bad = await fetch(url + '/api/draft-save', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url }, body: JSON.stringify({ token: review.token, target: 'other.json' }) }); assert.equal(bad.status, 422);
});
