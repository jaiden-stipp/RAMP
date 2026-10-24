# Project status and offline audit

```sh
ramp status ramp.json
ramp audit ramp.json --json
ramp audit ramp.json --evidence records/evidence.json
```

Both commands run the same read-only structural inspection; status defaults to a concise human report and `--json` returns stable `reportVersion: 1` data. Both exit nonzero on an integrity failure. Sections are `passed`, `failed`, or `not_checked`; a missing optional lock or absent evidence is explicitly not checked, not a successful verification.

Checks include manifest/module validation, optional baseline lock, effective configuration replay through resumed swaps, hash-chain/task transition integrity, referenced task artifact hashes, checkpoint schema/evidence snapshot validity and file hashes, budget ledger consistency, evidence/claim linkage and inference rules, task evidence IDs, and host journal hash chains. Evidence is discovered from `evidence.json`, the optional project-relative `--evidence` path, task evidence artifacts, and checkpoint evidence references. No arbitrary directories are searched; unrelated evidence files need an explicit argument or artifact reference.

Actions report blocked tasks and their unblock conditions, current owners/phases/next gates, stale pending checkpoints, and exhausted budgets. These operational conditions are not inherently corrupt records and do not by themselves make the integrity exit fail. A stale lock, changed/missing artifact, malformed journal, invalid configuration or dangling evidence reference does fail. Completed/resumed checkpoint inputs remain pinned historical artifacts; preserve revisions under new filenames. The effective view includes all resumed configuration changes; the baseline lock still checks the disk manifest.

`sourceSupport` is always **not checked**: IDs, URL strings, recorded accessibility, judgments and valid schemas do not prove that a passage supports a claim or that a claim is true. Source-support evaluation, reviewer independence, answer quality and semantic completeness require explicit assessment. This command never opens sources, invokes tools/models, schedules work, creates locks, refreshes hashes, or modifies project records. Hash chains detect inconsistent edits, not a maliciously rewritten history.
