const $ = id => document.getElementById(id);
let manifest, catalog, active = 0, category = 'roles', result, sequence = 0, timer;
let capabilities = [];
const kinds = ['roles', 'methods', 'personas', 'outputs'];
const labels = { roles: 'Role', methods: 'Methods', personas: 'Persona', outputs: 'Output' };
const rules = { roles: 'Exactly one', methods: 'Combine as needed', personas: 'At most one', outputs: 'At most one' };
const lines = value => value.split('\n').map(x => x.trim()).filter(Boolean);
const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
function agent() { return manifest.agents[active]; }
function fillCharter() {
  const project = manifest.project;
  for (const [id, key] of [['project-title', 'title'], ['project-id', 'id'], ['question', 'question'], ['scope', 'scope'], ['exclusions', 'exclusions'], ['stop-conditions', 'stopConditions']]) $(id).value = Array.isArray(project[key]) ? project[key].join('\n') : project[key];
  $('max-sources').value = project.limits.maxSources; $('max-iterations').value = project.limits.maxIterations;
  $('capabilities').replaceChildren();
  for (const capability of capabilities) {
    const label = element('label', undefined, 'check'); const input = document.createElement('input'); input.type = 'checkbox'; input.value = capability; input.checked = project.allowedCapabilities.includes(capability); input.addEventListener('change', editCharter); label.append(input, document.createTextNode(capability)); $('capabilities').append(label);
  }
  $('extra-capabilities').value = project.allowedCapabilities.filter(x => !capabilities.includes(x)).join('\n');
  $('ceiling-summary').textContent = `Permission ceiling: ${project.allowedCapabilities.join(', ') || 'No capabilities'}`;
}
function editCharter() {
  const project = manifest.project;
  project.title = $('project-title').value; project.id = $('project-id').value; project.question = $('question').value;
  for (const [id, key] of [['scope', 'scope'], ['exclusions', 'exclusions'], ['stop-conditions', 'stopConditions']]) project[key] = lines($(id).value);
  project.limits = { maxSources: Number($('max-sources').value), maxIterations: Number($('max-iterations').value) };
  project.allowedCapabilities = [...$('capabilities').querySelectorAll('input:checked')].map(x => x.value).concat(lines($('extra-capabilities').value));
  $('ceiling-summary').textContent = `Permission ceiling: ${project.allowedCapabilities.join(', ') || 'No capabilities'}`;
  changed();
}
function renderAgents() {
  $('active-agent').replaceChildren(...manifest.agents.map((a, index) => { const option = element('option', a.id || '(unnamed agent)'); option.value = index; return option; }));
  $('active-agent').value = active;
  $('agent-id').value = agent()?.id ?? '';
  $('agent-id').disabled = !agent(); $('remove-agent').disabled = !agent();
  renderModules(); renderAssembly();
}
function toggleModule(id, checked) {
  if (!agent()) return;
  agent().modules = checked ? [...agent().modules, id] : agent().modules.filter(x => x !== id);
  renderAssembly(); changed();
}
function renderModules() {
  $('modules').replaceChildren(); $('kind-title').textContent = category[0].toUpperCase() + category.slice(1); $('kind-rule').textContent = rules[category];
  for (const module of catalog.modules.filter(m => m.kind === category)) {
    const selected = agent()?.modules.includes(module.id);
    const card = element('article', undefined, `module${selected ? ' selected' : ''}`);
    const label = element('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.checked = Boolean(selected); input.disabled = !agent(); input.setAttribute('aria-label', `Select ${module.id}`);
    input.addEventListener('change', () => { card.classList.toggle('selected', input.checked); toggleModule(module.id, input.checked); });
    label.append(input, document.createTextNode(module.id.split('/')[1]));
    const details = element('details'); details.append(element('summary', 'Dependencies, permissions & instructions'));
    const list = element('dl');
    for (const [name, value] of [['Requires', module.requires], ['Excludes', module.excludes], ['Capabilities', module.capabilities]]) list.append(element('dt', name), element('dd', value.join(', ') || 'None'));
    const instructions = element('ol'); instructions.append(...module.instructions.map(text => element('li', text)));
    details.append(list, instructions);
    card.append(label, element('p', module.summary), element('div', `v${module.version} · ${module.origin}`, 'meta'), details); $('modules').append(card);
  }
}
function renderAssembly() {
  $('assembly').replaceChildren();
  for (const kind of kinds) {
    const group = element('section', undefined, 'stack-group'); group.append(element('h3', labels[kind]));
    const selected = agent()?.modules.filter(id => id.startsWith(`${kind}/`)) ?? [];
    if (!selected.length) group.append(element('div', kind === 'roles' ? 'Select a role to continue' : 'None selected', 'empty'));
    for (const id of selected) {
      const item = element('div', undefined, 'stack-item'); const button = element('button', '×'); button.type = 'button'; button.setAttribute('aria-label', `Remove ${id}`); button.addEventListener('click', () => { toggleModule(id, false); renderModules(); }); item.append(element('span', id.split('/')[1]), button); group.append(item);
    }
    $('assembly').append(group);
  }
}
function pending() { $('export').disabled = true; $('status').textContent = 'Checking configuration…'; $('status').parentElement.className = 'validation'; $('preview').textContent = 'Preview updates after validation.'; }
function changed() {
  $('manifest-json').value = JSON.stringify(manifest, null, 2);
  clearTimeout(timer); sequence++; pending(); timer = setTimeout(validate, 180);
}
async function post(path) { return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ manifest }) }); }
async function validate() {
  const current = ++sequence;
  try {
    const response = await post('/api/validate'); const data = await response.json(); if (current !== sequence) return; result = data;
    $('errors').replaceChildren(); $('status').parentElement.className = `validation ${data.valid ? 'valid' : 'invalid'}`;
    $('status').textContent = data.valid ? '✓ Ready to export' : 'Resolve configuration issues';
    for (const diagnostic of data.diagnostics ?? []) {
      const item = element('li'); const link = element('a', `${diagnostic.path || '/'}: ${diagnostic.message}`); const index = diagnostic.path?.match(/^\/agents\/(\d+)/)?.[1];
      link.href = index !== undefined ? '#active-agent' : '#charter-heading';
      if (index !== undefined) link.addEventListener('click', () => { active = Number(index); renderAgents(); $('active-agent').focus(); });
      item.append(link); $('errors').append(item);
    }
    $('export').disabled = !data.valid; renderPreview(); renderChanges();
  } catch (error) { if (current !== sequence) return; $('status').textContent = 'Cannot reach the local builder. Restart it to continue.'; $('status').parentElement.className = 'validation invalid'; $('export').disabled = true; }
}
function renderPreview() {
  const previous = $('preview-agent').value;
  $('preview-agent').replaceChildren(...(result?.previews ?? []).map(a => { const option = element('option', a.id); option.value = a.id; return option; }));
  if (result?.previews?.some(a => a.id === previous)) $('preview-agent').value = previous;
  $('preview').textContent = result?.valid ? result.previews.find(a => a.id === $('preview-agent').value)?.instructions ?? '' : 'Resolve the inline issues to preview valid instructions. The shared core remains visible above.';
}
function renderChanges() {
  $('changes').replaceChildren();
  if (!result?.valid) { $('changes').append(element('p', 'Resolve the inline issues to compare configurations.')); return; }
  if (!result.changes.length) { $('changes').append(element('p', 'No changes since opening this workspace.')); return; }
  for (const key of Object.keys(manifest.project)) {
    if (JSON.stringify(catalog.manifest.project[key]) !== JSON.stringify(manifest.project[key])) {
      const entry = element('div', undefined, 'change'); entry.append(element('strong', `Project ${key} changed`), element('pre', `Before\n${JSON.stringify(catalog.manifest.project[key], null, 2)}\n\nAfter\n${JSON.stringify(manifest.project[key], null, 2)}`)); $('changes').append(entry);
    }
  }
  for (const change of result.changes) {
    const entry = element('div', undefined, 'change');
    const names = { manifestHash: 'Project manifest changed', coreHash: 'Shared core changed', agents: 'Agent module selections changed', 'module-added': 'Module added', 'module-removed': 'Module removed', 'module-changed': 'Module content changed', format: 'Lock format changed' };
    entry.append(element('strong', `${names[change.kind] || change.kind}${change.id ? `: ${change.id}` : ''}`));
    if (change.kind === 'agents') entry.append(element('pre', `Before\n${JSON.stringify(change.before, null, 2)}\n\nAfter\n${JSON.stringify(change.after, null, 2)}`));
    if (change.changedFields) entry.append(element('p', `Changed: ${change.changedFields.join(', ')}`), element('pre', JSON.stringify(change.currentValues, null, 2)));
    $('changes').append(entry);
  }
}
function inspect(changes) { $('changes-view').hidden = !changes; $('preview-view').hidden = changes; $('show-preview').setAttribute('aria-pressed', String(!changes)); $('show-changes').setAttribute('aria-pressed', String(changes)); }
$('charter').addEventListener('submit', event => event.preventDefault()); $('charter').addEventListener('input', editCharter);
$('categories').addEventListener('click', event => { const kind = event.target.dataset.kind; if (!kind) return; category = kind; for (const button of $('categories').children) button.setAttribute('aria-pressed', String(button.dataset.kind === kind)); renderModules(); });
$('active-agent').addEventListener('change', () => { active = Number($('active-agent').value); renderAgents(); });
$('agent-id').addEventListener('input', () => { agent().id = $('agent-id').value; $('active-agent').selectedOptions[0].textContent = agent().id || '(unnamed agent)'; changed(); });
$('add-agent').addEventListener('click', () => { let index = manifest.agents.length + 1; while (manifest.agents.some(a => a.id === `agent-${index}`)) index++; manifest.agents.push({ id: `agent-${index}`, modules: [] }); active = manifest.agents.length - 1; renderAgents(); changed(); $('agent-id').focus(); });
$('remove-agent').addEventListener('click', () => { manifest.agents.splice(active, 1); active = Math.max(0, active - 1); renderAgents(); changed(); $('active-agent').focus(); });
$('show-preview').addEventListener('click', () => inspect(false)); $('show-changes').addEventListener('click', () => inspect(true)); $('preview-agent').addEventListener('change', () => { $('preview').textContent = result.previews.find(a => a.id === $('preview-agent').value)?.instructions ?? ''; });
$('apply-json').addEventListener('click', () => {
  try {
    const next = JSON.parse($('manifest-json').value);
    // The visual controls require this shape; all actual contract rules remain in the shared validator.
    if (!next?.project || !Array.isArray(next.agents) || !next.project.limits || !Array.isArray(next.project.allowedCapabilities) || next.agents.some(a => typeof a?.id !== 'string' || !Array.isArray(a.modules) || a.modules.some(m => typeof m !== 'string'))) throw new Error('Expected project, limits, allowedCapabilities and agents with string IDs and module arrays.');
    manifest = next; active = 0; fillCharter(); renderAgents(); changed(); $('json-error').textContent = '';
  } catch (error) { $('json-error').textContent = error.message; }
});
$('export').addEventListener('click', async () => {
  $('export').disabled = true;
  try {
    const response = await post('/api/export');
    if (!response.ok) { await validate(); return; }
    const url = URL.createObjectURL(await response.blob()); const link = element('a'); link.href = url; link.download = 'ramp-configuration.zip'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { $('status').textContent = 'Export failed. Check that the local server is running.'; }
  finally { await validate(); }
});
async function start() {
  try {
    const response = await fetch('/api/catalog'); if (!response.ok) throw new Error('Catalog unavailable'); catalog = await response.json(); manifest = structuredClone(catalog.manifest);
    capabilities = [...new Set(catalog.modules.flatMap(m => m.capabilities).concat(manifest.project.allowedCapabilities))].sort();
    $('core').textContent = catalog.core; $('catalog-errors').textContent = catalog.diagnostics.map(d => `${d.message}`).join('\n'); fillCharter(); renderAgents(); $('manifest-json').value = JSON.stringify(manifest, null, 2); await validate();
  } catch { $('status').textContent = 'Cannot load this workspace. Check the local server output.'; }
}
start();
