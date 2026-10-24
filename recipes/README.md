# Research recipes

These are configurations and output contracts, not completed studies. Replace each question/scope with the actual project decision before gathering evidence. Copy a recipe directory outside the checkout, validate its ramp.json, and compose instructions from the RAMP CLI. No model credentials are needed for validation/composition; the operator still supplies authorized tools, source access, and task/review ownership.

| Recipe | Prerequisites | Output and review | Limits |
| --- | --- | --- | --- |
| scoped-literature-review | Bounded question, inclusion/exclusion criteria, accessible sources | Literature map: verify passages, inclusion decisions, source independence, contrary findings, uncertainty | Twelve sources/three cycles; not a claim of systematic coverage |
| technical-feasibility | One proposal, requirements, constraints, explicit success thresholds | Feasibility brief: distinguish observed evidence from assumptions, challenge transferable conditions and failure modes | Ten sources/three cycles; no implicit prototype/spending authorization |
| alternative-comparison | Two/three alternatives, common criteria, decision-maker weights or explicit unknowns | Comparison matrix: inspect source support, unit/condition comparability, sensitivity and missing data | Twelve sources/three cycles; no ranking without justification |

For example: `node src/cli.js validate recipes/technical-feasibility/ramp.json`, then `node src/cli.js compose recipes/technical-feasibility/ramp.json --agent synthesist`. The selected output module supplies the contract. Module dependencies remain explicit. No recipe invents search results, findings, measurements, or completed experiments.

## Change presentation without changing research authority

On an agent with `personas/concise-analyst`, substitute `personas/teaching-guide` while retaining the same role/method/output modules. Concise analyst emphasizes compact findings and limitations; teaching guide explains reasoning and terms. Both have an empty capability list and preserve the core and charter. Validate/recompose and record a handoff if work is in progress. `test/recipes.test.js` compares both variants and verifies identical permission requirements/core rules.

Methods control research work; personas control presentation. Source-quality and disconfirming-evidence can be combined, with evidence-first explicitly selected. Feasibility-check and tradeoff-comparison address specific decisions; neither grants access or proves its conclusions. This is a small reviewed module collection, not a registry or automatic package installer.
