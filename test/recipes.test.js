import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { REPO_ROOT, loadProject, compose, configureAgent } from '../src/protocol.js';
const recipes = ['scoped-literature-review', 'technical-feasibility', 'alternative-comparison'];
test('every recipe validates and composes its explicit output contract without credentials', () => {
  for (const name of recipes) {
    const dir = join(REPO_ROOT, 'recipes', name); const p = loadProject(join(dir, 'ramp.json'));
    const output = compose(p);
    assert.ok(output.includes(p.core.trim()));
    const synth = p.agents.find(a => a.id === 'synthesist');
    assert.equal(synth.modules.filter(m => m.kind === 'outputs').length, 1);
    assert.ok(output.includes(synth.modules.find(m => m.kind === 'outputs').id));
    assert.ok(p.agents.find(a => a.id === 'analyst').modules.filter(m => m.kind === 'methods').length >= 2);
  }
});
test('persona variants keep methods, capability requirements, charter, and shared core identical', () => {
  const dir = join(REPO_ROOT, 'recipes/technical-feasibility'); const base = loadProject(join(dir, 'ramp.json'));
  const ids = base.manifest.agents.find(a => a.id === 'analyst').modules.filter(id => !id.startsWith('personas/'));
  const variants = ['personas/concise-analyst', 'personas/teaching-guide'].map(persona => configureAgent(base, 'analyst', [...ids, persona], dir));
  const requirements = p => [...new Set(p.agents.find(a => a.id === 'analyst').modules.flatMap(m => m.capabilities))].sort();
  assert.deepEqual(requirements(variants[0]), requirements(variants[1]));
  assert.equal(variants[0].core, variants[1].core); assert.deepEqual(variants[0].manifest.project, variants[1].manifest.project);
  assert.notEqual(compose(variants[0], 'analyst'), compose(variants[1], 'analyst'));
});
