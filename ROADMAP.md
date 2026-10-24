# Roadmap

## Available in the 0.1.0 draft

The ordered development work in issues #1–#12 is implemented:

- Shared research core, project charters, and independently composable role, method, persona, and output contracts.
- Versioned JSON Schemas, semantic configuration checks, and machine-readable validation diagnostics.
- Safe project scaffolding, per-agent instruction export, and contained project-local modules with explicit origins.
- Portable configuration lockfiles, normalized hashes, locked validation/composition, and field-level change previews.
- Structured evidence/claim records, reference and inference-graph audits, and readable evidence export.
- Persistent task histories, validated state transitions, phase gates, review outcomes, and completion artifacts.
- Handoff checkpoints, preserved evidence/uncertainty/questions, validated module swaps, and restart checks.
- Shared source/iteration reservations and durable budget accounting across agents.
- A primary-source research pilot comparing one role-changing context with separate agent contexts, plus reproducible offline evaluations and synthetic negative controls.
- A provider-neutral reference host that mediates declared capabilities, tool/destination scope, phase gates, budgets, checkpoints, and cancellation; deterministic fake tools/agents demonstrate integration without model credentials.
- Literature-review, technical-feasibility, and alternative-comparison recipes with interchangeable methods, personas, and outputs.
- A local visual configuration builder using the same validator, instruction previews, change inspection, and portable ZIP export.

## Evidence still needed

The [pilot report](examples/pilot-citation-reliability/REPORT.md) documents observed failures and limits. One workflow per condition and model-based reviews do **not** establish a general or causal reliability advantage. Structural presence and reference integrity do **not** establish source support, answer quality, or full context fidelity. Unsupported but well-formed assertions remain a deliberate negative control.

Prioritize repeated, matched-scope research tasks with blinded human judgments, source-support assessment, preservation of material caveats, and explicit failure accounting before making comparative performance claims. Future paid/external experiments require authorization. Improve the handoff rubric using the omissions and scope differences preserved in the first pilot.

## Possible follow-up work

- Conformance suites and adapters for external agent frameworks, guided by concrete integration failures rather than a competing scheduler.
- Stronger storage/concurrency guarantees if evidence shows local journals are insufficient; current mutexes and hash chains are not distributed coordination or protection against a malicious editor.
- Version resolution and a reviewed module registry only after real reuse demonstrates a need. Current module resolution is explicit, local, and lock-checked.
- Broader accessibility testing, larger project usability studies, and reproducible research replications.
- Select a distribution license and governance before accepting outside contributions or distributing for third-party reuse.

These follow-ups are not implemented features or commitments. The draft remains model-independent and framework-independent.
