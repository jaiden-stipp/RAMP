import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, loadProject, validateManifest, validateModule } from '../src/protocol.js';
import { schemaDiagnostics } from '../src/validation.js';

const source = join(REPO_ROOT, 'examples/literature-review/ramp.json');
const example = () => JSON.parse(readFileSync(source, 'utf8'));
test('all built-in modules and example satisfy published schemas and semantic validation', () => {
  assert.deepEqual(schemaDiagnostics('project', example()), []);
  loadProject(source);
  for (const kind of ['roles', 'methods', 'personas', 'outputs']) {
    for (const file of readdirSync(join(REPO_ROOT, 'modules', kind))) {
      const id = `${kind}/${file.slice(0, -5)}`;
      const value = JSON.parse(readFileSync(join(REPO_ROOT, 'modules', kind, file), 'utf8'));
      assert.deepEqual(schemaDiagnostics('module', value), []);
      validateModule(value, id);
    }
  }
});
test('schema/reference parity across malformed structural contracts', () => {
  const mutations = [p => delete p.project, p => p.agents = [], p => p.project.title = '  ', p => p.extra = 1, p => p.project.limits.maxSources = 1.1, p => p.agents[0].modules.push('../escape')];
  for (const mutate of mutations) {
    const p = example(); mutate(p);
    assert.ok(schemaDiagnostics('project', p).length);
    assert.throws(() => validateManifest(p));
  }
  const m = JSON.parse(readFileSync(join(REPO_ROOT, 'modules/roles/scout.json'), 'utf8'));
  for (const mutate of [x => delete x.summary, x => x.kind = 'unknown', x => x.instructions = [], x => x.capabilities = ['BAD'], x => x.extra = true]) {
    const v = structuredClone(m); mutate(v);
    assert.ok(schemaDiagnostics('module', v).length);
    assert.throws(() => validateModule(v, m.id));
  }
});
test('JSON diagnostics accumulate field errors and identify source files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ramp-diagnostics-'));
  const file = join(dir, 'broken.json');
  const p = example(); p.project.title = ''; p.project.limits.maxSources = 0; p.project.surprise = true;
  writeFileSync(file, JSON.stringify(p));
  const result = spawnSync(process.execPath, [join(REPO_ROOT, 'src/cli.js'), 'validate', file, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.valid, false);
  assert.ok(output.diagnostics.length >= 3);
  assert.ok(output.diagnostics.every(d => d.file === file && d.code.startsWith('SCHEMA_')));
  assert.ok(output.diagnostics.some(d => d.path === '/project/limits/maxSources'));
  writeFileSync(file, '{');
  const malformed = spawnSync(process.execPath, [join(REPO_ROOT, 'src/cli.js'), 'validate', file, '--json'], { encoding: 'utf8' });
  assert.equal(JSON.parse(malformed.stdout).diagnostics[0].code, 'JSON_SYNTAX');
});
