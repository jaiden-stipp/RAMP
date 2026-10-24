import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { REPO_ROOT, loadProject, compose } from '../src/protocol.js';
import { initializeProject } from '../src/scaffold.js';

function fixture() {
  const parent = mkdtempSync(join(tmpdir(), 'ramp local '));
  const dir = join(parent, 'project'); initializeProject(dir);
  const file = join(dir, 'ramp.json');
  return { parent, dir, file, manifest: JSON.parse(readFileSync(file, 'utf8')) };
}
function put(dir, id, changes = {}) {
  const m = { id, version: '0.1.0', protocolVersion: '0.1.0', kind: id.split('/')[0], summary: 'Custom module', instructions: ['Preserve core invariants.'], requires: [], excludes: [], capabilities: [], ...changes };
  const file = join(dir, 'modules', `${id}.json`); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(m)); return file;
}
const save = f => writeFileSync(f.file, JSON.stringify(f.manifest));
test('external projects compose every custom module kind with portable origin provenance', () => {
  const f = fixture();
  const ids = ['roles/custom', 'methods/custom', 'personas/custom', 'outputs/custom'];
  ids.forEach(id => put(f.dir, id));
  f.manifest.agents = [{ id: 'custom', modules: [...ids, 'methods/evidence-first'] }]; save(f);
  const p = loadProject(f.file);
  assert.ok(p.agents[0].modules.slice(0, 4).every(m => m.origin.startsWith('project:modules/')));
  assert.match(compose(p), /Origin: builtin:methods\/evidence-first.json/);
});
test('duplicates, missing modules, identity, dependencies, exclusions, and permission escalation fail', () => {
  for (const failure of ['duplicate', 'missing', 'id', 'dependency', 'exclusion', 'persona', 'capability']) {
    const f = fixture();
    if (failure === 'duplicate') put(f.dir, 'roles/scout');
    else {
      const id = failure === 'persona' ? 'personas/custom' : 'methods/custom';
      f.manifest.agents[0].modules.push(id);
      if (failure !== 'missing') put(f.dir, id, {
        ...(failure === 'id' ? { id: 'methods/other' } : {}),
        ...(failure === 'dependency' ? { requires: ['methods/absent'] } : {}),
        ...(failure === 'exclusion' ? { excludes: ['roles/scout'] } : {}),
        ...(['persona', 'capability'].includes(failure) ? { capabilities: ['network.send'] } : {})
      });
    }
    save(f); assert.throws(() => loadProject(f.file), undefined, failure);
  }
});
test('escaping project root junctions and module directory junctions are rejected', () => {
  const f = fixture(); const outside = join(f.parent, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(f.dir, 'modules'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => loadProject(f.file), /outside the project/);
  const g = fixture(); mkdirSync(join(g.dir, 'modules'));
  symlinkSync(outside, join(g.dir, 'modules/methods'), process.platform === 'win32' ? 'junction' : 'dir');
  writeFileSync(join(outside, 'escape.json'), '{}');
  g.manifest.agents[0].modules.push('methods/escape'); save(g);
  assert.throws(() => loadProject(g.file), /outside approved module directory/);
});
