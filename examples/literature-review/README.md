# Example: traceable research

This is an illustrative configuration. No research has been carried out and no source findings are implied.

From the repository root:

```sh
node src/cli.js validate examples/literature-review/ramp.json
node src/cli.js compose examples/literature-review/ramp.json --out dist/research-agents.md
```

The generated file contains the shared core and charter, followed by separate agent instructions. The configuration hashes identify the inputs used to generate it. Give each agent the shared sections plus its own section; the bundle does not launch or route work.

1. The operator confirms the question, creates tasks with acceptance criteria, and maps `source.read` and `artifact.write` to specific permitted tools and destinations.
2. The scout gathers relevant sources and starts an evidence ledger. Sources count toward the shared limit of 12.
3. The analyst connects claims to evidence and records alternative explanations.
4. The reviewer checks cited locations and challenges unsupported reasoning. Failed review returns work to the analyst and consumes a new iteration when another research cycle starts.
5. The synthesist produces a brief with a complete/partial/blocked disposition, evidence, limitations, and open questions.

Use `templates/handoff.md` between roles. If using one underlying agent for all roles, record module swaps and disclose that its review is self-review. The operator tracks the three-iteration limit across the whole project and stops additional research when either budget is exhausted.
