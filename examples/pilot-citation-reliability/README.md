# Reproducible citation-reliability pilot

This directory records an actual source-reading workflow performed in the existing Codex chat on 2026-10-23 (America/Los_Angeles). There were two drafting conditions: one assistant context changing roles and one separately authorized analyst context. A third, separately authorized reviewer context assessed both outputs. One follow-up analyst inspection examined a later handoff; it is not another independent research trial. Exact model identifiers were unavailable; all contexts inherited the session settings. No external model API, paid experiment, new subscription, timing benchmark, randomization, or human adjudication occurred.

The three public primary pages, publication statuses, short excerpts, access date and exact section locators are in sources.json. evidence.json contains observed claims and explicitly marked design inference. The initial universal semantics hypothesis and its correction are retained. single-agent-brief.md and separate-agent-brief.md are original outputs, unchanged after cross-review. source-review.json/separate-review.md are model assessments, not human truth labels. separate-preservation-review.json records the later context comparison, including missing details and its timing limitation.

recorded-single/ and recorded-separate/ contain source/configuration hashes, checkpoints, restored instructions, task/budget journals, and final run records. These logs were reconstructed from the actually examined packet and outputs by record-run.js; they are not a claim that a runtime adapter mediated the original web/model calls. The script emits fresh timestamps and IDs on replay. It never refetches sources or launches models. Two cycles and three unique sources are accounted for in each condition; page reopens use the same source identities.

After `npm ci`, reproduce the offline evaluation from the repository root:

```sh
node evaluation/run.js
node --test test/evaluation.test.js
node src/cli.js evidence-validate examples/pilot-citation-reliability/evidence.json
node src/cli.js validate examples/pilot-citation-reliability/ramp.json --locked
```

Reconstruct the saved workflow in a NEW directory whose parent exists:

```sh
node examples/pilot-citation-reliability/record-run.js <new-directory> single-agent complete
node examples/pilot-citation-reliability/record-run.js <another-new-directory> separate-agents complete
```

Neither command is another live research run. Original logs are retained. See ../../evaluation/RUBRIC.md for scoring/missing data and REPORT.md for observed results and limitations. Unsupported-but-well-formed and lost-context mutations are explicitly synthetic negative controls, never real agent outputs.
