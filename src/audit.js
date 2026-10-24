import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadProject, readJson } from './protocol.js';
import { assertLocked, lockPath, configurationLock } from './lockfile.js';
import { effectiveProject } from './effective-project.js';
import { TaskStore, artifactReference, PHASES } from './tasks.js';
import { HandoffStore } from './handoffs.js';
import { BudgetStore } from './budgets.js';
import { validateEvidence } from './evidence.js';
import { readJournal } from './journal.js';
import { diagnostic, diagnosticsOf } from './validation.js';

export function projectReport(manifestPath, evidencePath) {
  const directory = dirname(manifestPath); const sections = {}; const actions = [];
  function check(name, file, work) {
    try { const data = work(); return sections[name] = { status: 'passed', diagnostics: [], ...data }; }
    catch (error) { return sections[name] = { status: 'failed', diagnostics: diagnosticsOf(error, file) }; }
  }
  const skip = (name, reason) => sections[name] = { status: 'not_checked', reason, diagnostics: [] };
  let base, project;
  check('configuration', manifestPath, () => { base = loadProject(manifestPath); return { projectId: base.manifest.project.id, agents: base.agents.map(a => a.id) }; });
  if (base) {
    if (existsSync(lockPath(manifestPath))) check('lock', lockPath(manifestPath), () => { assertLocked(base, lockPath(manifestPath)); return {}; });
    else skip('lock', 'No lockfile; create one explicitly after reviewing the configuration');
    check('effectiveConfiguration', manifestPath, () => { project = effectiveProject(base, directory); return { lock: configurationLock(project) }; });
    const tasks = new TaskStore(join(directory, '.ramp/tasks.jsonl'), base, directory); const store = new HandoffStore(tasks);
    let items = []; let history;
    check('tasks', tasks.path, () => {
      items = tasks.list();
      const errors = [];
      items.forEach((task, index) => {
        task.artifacts.forEach((a, i) => { try { if (artifactReference(directory, a).hash !== a.hash) throw new Error(`Artifact changed: ${a.path}`); } catch (error) { errors.push(...diagnosticsOf(error, join(directory, a.path), `/tasks/${index}/artifacts/${i}`)); } });
        if (task.status === 'blocked') actions.push({ code: 'TASK_BLOCKED', taskId: task.id, message: `${task.blocker}; unblock when: ${task.unblockCondition}` });
        if (!['done', 'cancelled'].includes(task.status)) actions.push({ code: 'NEXT_GATE', taskId: task.id, message: `Owner ${task.owner}; ${task.status}/${task.phase}; next phase ${PHASES[PHASES.indexOf(task.phase) + 1] ?? 'completion'}` });
      });
      if (errors.length) { const error = new Error('Invalid task artifacts'); error.diagnostics = errors; throw error; }
      return { items };
    });
    check('checkpoints', tasks.path, () => {
      history = store.list(); const errors = [];
      for (const c of history.checkpoints) {
        for (const a of [{ path: c.evidenceFile, kind: 'evidence', hash: c.evidenceHash }, ...c.artifacts]) {
          try { if (artifactReference(directory, a).hash !== a.hash) throw new Error(`Checkpoint ${c.id} artifact changed: ${a.path}`); }
          catch (error) { errors.push(...diagnosticsOf(error, join(directory, a.path), `/checkpoints/${c.id}`)); }
        }
        if (!history.resumed.includes(c.id)) {
          try { store.preview(c.id); }
          catch (error) { actions.push({ code: 'CHECKPOINT_STALE', checkpointId: c.id, message: `Prepare a fresh handoff: ${error.message}` }); }
        }
      }
      if (errors.length) { const error = new Error('Invalid checkpoint artifacts'); error.diagnostics = errors; throw error; }
      return { count: history.checkpoints.length, pending: history.checkpoints.filter(c => !history.resumed.includes(c.id)).map(c => c.id) };
    });
    check('budgets', join(directory, '.ramp/budgets.jsonl'), () => {
      const usage = new BudgetStore(join(directory, '.ramp/budgets.jsonl'), base.manifest.project.id, base.manifest.project.limits, base.agents.map(a => a.id)).snapshot();
      for (const [kind, remaining] of Object.entries(usage.remaining)) if (remaining === 0) actions.push({ code: 'BUDGET_EXHAUSTED', message: `${kind} allowance exhausted; deliver a partial result or hand off without new acquisition` });
      return usage;
    });
    const paths = new Set([...(evidencePath ? [evidencePath] : []), ...(existsSync(join(directory, 'evidence.json')) ? ['evidence.json'] : []), ...items.flatMap(t => t.artifacts.filter(a => a.kind === 'evidence').map(a => a.path)), ...(history?.checkpoints ?? []).map(c => c.evidenceFile)]);
    if (!paths.size) skip('evidence', 'No evidence.json, explicit --evidence file, task evidence artifact or checkpoint evidence file');
    else check('evidence', directory, () => {
      const files = []; const errors = []; const ids = new Set();
      for (const path of paths) {
        try {
          artifactReference(directory, { path, kind: 'evidence' });
          const bundle = validateEvidence(readJson(join(directory, path)).value, join(directory, path));
          if (bundle.projectId !== base.manifest.project.id) throw new Error('Evidence project ID mismatch');
          bundle.evidence.forEach(e => ids.add(e.id)); files.push({ path, evidence: bundle.evidence.length, claims: bundle.claims.length });
        } catch (error) { errors.push(...diagnosticsOf(error, join(directory, path))); }
      }
      items.forEach((task, index) => task.evidenceIds.forEach(id => { if (!ids.has(id)) errors.push(diagnostic('TASK_EVIDENCE_REFERENCE', `Unknown task evidence: ${id}`, tasks.path, `/tasks/${index}/evidenceIds`)); }));
      if (errors.length) { const error = new Error('Evidence audit failed'); error.diagnostics = errors; throw error; }
      return { files, interpretation: 'Reference structure only; no source-support judgment or factual verification' };
    });
    if (!paths.size && items.some(t => t.evidenceIds.length)) sections.evidence = { status: 'failed', diagnostics: [diagnostic('TASK_EVIDENCE_REFERENCE', 'Tasks reference evidence but no structured evidence file is discoverable', tasks.path, '/tasks')] };
    check('hostJournal', join(directory, '.ramp/host.jsonl'), () => ({ records: readJournal(join(directory, '.ramp/host.jsonl')).length }));
  } else for (const name of ['lock', 'effectiveConfiguration', 'tasks', 'checkpoints', 'budgets', 'evidence', 'hostJournal']) skip(name, 'A valid project configuration is required');
  skip('sourceSupport', 'Not checked: source accessibility/linkage and recorded review assertions do not establish factual accuracy. Human/source assessment is required. No sources or models were called.');
  return { reportVersion: 1, projectId: base?.manifest.project.id ?? null, integrityPassed: !Object.values(sections).some(s => s.status === 'failed'), sections, actions };
}

export function reportMarkdown(report) {
  return [`RAMP project: ${report.projectId ?? '(invalid configuration)'}`, `Integrity: ${report.integrityPassed ? 'passed checked sections' : 'FAILED'}`,
    ...Object.entries(report.sections).flatMap(([name, section]) => [`${name}: ${section.status}${section.reason ? ` — ${section.reason}` : ''}`, ...section.diagnostics.map(d => `  ${d.file}${d.path || '/'}: ${d.message}`)]),
    ...(report.sections.tasks?.items ?? []).map(t => `Task ${t.id}: ${t.owner}; ${t.status}/${t.phase}; ${t.disposition ?? 'undelivered'}`),
    ...(report.sections.budgets?.remaining ? [`Remaining budget: ${JSON.stringify(report.sections.budgets.remaining)}`] : []),
    ...report.actions.map(a => `Action ${a.code}${a.taskId ? ` (${a.taskId})` : ''}: ${a.message}`)].join('\n');
}
