# Pilot charter: citation reliability in handoffs

Question: What can JSON Schema validation and provenance records establish about citation reliability in a research-agent handoff?

Audience: RAMP maintainers deciding what validation may claim and which review records to preserve.

Scope: JSON Schema's documented validation scope, W3C provenance concepts, and source-support review. Exclude clinical/legal/financial advice, paid experiments, model performance rankings, and claims about all research domains.

Host: this existing Codex chat, using the session's configured model (its exact model identifier is not exposed to the assistant), web tools for public primary sources, and local Node.js tooling. No external model API, new subscription, or paid experiment. An optional separate-agent condition requires explicit authorization for in-chat subagents, inheriting current model settings; no model switch.

Budgets: at most three distinct primary sources and two research cycles. One completed manual source-review workflow is the minimum; any separate-agent condition shares the same source packet rather than adding retrievals. Offline replays use no API keys.

Acceptance: deliver a cited answer, exact source locators, uncertainty, review findings, source/configuration hashes, handoff/context records, budget events, and an honest complete/partial/blocked disposition. Report actual run counts, missing conditions, and limitations. Evaluate preservation of recorded facts separately from whether a source supports a claim. No general reliability improvement is established by a single case.

Initial hypothesis to challenge: "Schema validation checks structure only and cannot check any semantic property." This is unverified and deliberately retained for source review; do not present it as a research finding.
