# RAMP

**Research Agent Management Protocol**

A shared protocol for configuring research agents, organizing their work, and preserving evidence as a project moves between agents.

The inspiration is Baymax's interchangeable personality chips: a stable core stays in place while modules change what an agent specializes in and how it interacts. In RAMP, the core holds research integrity and project boundaries. Modules supply roles, methods, communication styles, and output formats.

**Status: 0.1.0 draft with configuration tooling, persistent research records, a reference host, and a recorded pilot.** The reference host mediates explicitly configured tools, state gates, and budgets. External frameworks own model execution and scheduling; structural checks do not prove source support or model behavior.

## The idea

```text
RAMP core + project charter + selected modules = configured research agent
```

| Layer | Purpose | Example |
| --- | --- | --- |
| Core | Shared evidence, uncertainty, handoff, and permission rules | Cite claims; preserve disagreements |
| Project | Question, scope, budgets, permissions, and completion criteria | Review a topic using at most 12 sources |
| Role | Responsibility within the research workflow | Scout, analyst, reviewer, synthesist |
| Method | How research is conducted | Evidence-first research |
| Persona | How the agent communicates | Calm guide |
| Output | Shape of the deliverable | Research brief |

Personality is independent of authority: a persuasive or adventurous persona cannot grant tools, bypass review, or change what counts as evidence.

## Try it

Requires Node.js 22 or later. Install the pinned validator dependencies with `npm ci`. No credentials or API keys are needed. See [schema/editor and diagnostics support](docs/VALIDATION.md).

```sh
npm ci
npm test
npm run validate
npm run compose
node src/cli.js compose examples/literature-review/ramp.json --out dist/research-agents.md
```

The last command creates a Markdown instruction bundle for the sample project. Give each agent the core, project charter, and its own agent section; use the handoff template when transferring work. The operator or host application must supply tools and enforce permissions and budgets.

The example asks how a small research team can keep findings traceable across agent handoffs. It contains an illustrative project configuration, not completed research or fabricated findings.

## Configure a project

Create a new directory with `node src/cli.js init <new-directory>` (the parent must exist). The command refuses existing directories and includes a valid manifest, research templates, and a getting-started guide. Use `node src/cli.js --help` for commands. Export independent agent instructions with `node src/cli.js compose <ramp.json> --agent reviewer --out reviewer.md`; shared core, charter, and provenance are always included. Existing output files are never overwritten.

Copy [the example manifest](examples/literature-review/ramp.json), change the question and boundaries, and select module IDs for each agent:

```json
{
  "id": "reviewer",
  "modules": ["roles/reviewer", "methods/evidence-first", "personas/calm-guide"]
}
```

Module files live under `modules/<kind>/<name>.json`. Every agent needs exactly one role; methods are additive; a persona and output module are optional and limited to one each. Missing dependencies, conflicting modules, incompatible protocol versions, unknown fields, and capabilities outside the project ceiling fail validation.

Changing modules changes the agent configuration. Record a handoff and recompose the instructions before resuming; changing a persona does not erase research history.

## Read next

Use [configuration lockfiles](docs/LOCKFILES.md) to reproduce an agent configuration and review changes before a research session. Locks never refresh during ordinary validation or composition.

- [Protocol specification](spec/PROTOCOL.md): requirements, lifecycle, contracts, and composition.
- [Module authoring](docs/MODULES.md): create and review a new module.
- [Example workflow](examples/literature-review/README.md): run the sample manually.
- [Templates](templates/): project charter, evidence ledger, handoff, and research brief.
- [Structured evidence](docs/EVIDENCE.md): offline claim/reference audits and readable ledger export.
- [Persistent tasks](docs/TASKS.md): append-only history, phase gates, review, and executable workflow example.
- [Handoff checkpoints](docs/HANDOFFS.md) and [shared budgets](docs/BUDGETS.md): resumable context, module swaps, and project-wide reservations.
- [Recorded research pilot](examples/pilot-citation-reliability/README.md): actual source review, separate model contexts, preserved failures, and an offline evaluation rubric/report. It does not establish a general performance advantage.
- [Reference host adapter](docs/HOSTS.md): capability/tool mediation, budgets, cancellation, checkpoints, and a deterministic fake-agent example without API keys.
- [Research recipes](recipes/README.md): scoped literature review, technical feasibility, alternative comparison, and interchangeable method/persona/output modules.
- [Roadmap](ROADMAP.md): proposed next steps.
- [Contributing](CONTRIBUTING.md): evolve the draft with concrete use cases.

No distribution license has been selected yet. Choose one before distributing the project for third-party reuse.
