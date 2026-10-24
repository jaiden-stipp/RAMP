import test from 'node:test';
import assert from 'node:assert/strict';
import { selectModule } from '../src/builder/selection.js';
import { createBuilderService } from '../src/builder/service.js';
import { REPO_ROOT, readJson } from '../src/protocol.js';
import { join } from 'node:path';

test('single-category replacements are atomic, preserve explicit methods, and exported configurations validate', () => {
  const path = join(REPO_ROOT, 'examples/literature-review/ramp.json'); const service = createBuilderService(path);
  const manifest = structuredClone(readJson(path).value); const agent = manifest.agents[0];
  agent.modules = selectModule(agent.modules, 'roles/analyst', true);
  assert.deepEqual(agent.modules.filter(id => id.startsWith('roles/')), ['roles/analyst']); assert.ok(agent.modules.includes('methods/evidence-first'));
  for (const persona of ['personas/concise-analyst', 'personas/teaching-guide']) { agent.modules = selectModule(agent.modules, persona, true); assert.equal(agent.modules.filter(id => id.startsWith('personas/')).length, 1); }
  agent.modules = selectModule(agent.modules, 'methods/source-quality', true); assert.equal(agent.modules.filter(id => id.startsWith('methods/')).length, 2);
  for (const output of ['outputs/research-brief', 'outputs/literature-map']) agent.modules = selectModule(agent.modules, output, true);
  assert.deepEqual(agent.modules.filter(id => id.startsWith('outputs/')), ['outputs/literature-map']); assert.equal(service.validate(manifest).valid, true); assert.ok(service.archive(manifest).length > 0);
  agent.modules = selectModule(agent.modules, 'outputs/literature-map', false); assert.equal(agent.modules.filter(id => id.startsWith('outputs/')).length, 0);
  agent.modules = selectModule(agent.modules, 'methods/evidence-first', false); assert.equal(service.validate(manifest).valid, false, 'no silent dependencies');
  agent.modules = selectModule(agent.modules, 'methods/evidence-first', true); manifest.project.allowedCapabilities = []; assert.equal(service.validate(manifest).valid, false, 'no silent capabilities');
});
