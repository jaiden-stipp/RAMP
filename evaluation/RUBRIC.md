# Pilot rubric v1

Report format v2 adds `sourceSupportReview`: per-claim reference linkage and optional bound review-sidecar assertions, with factualVerification always not_checked. Missing sidecars produce not_reviewed; older aggregate human/model judgments remain separately reported and are not silently converted into bound claim reviews. Existing metric denominators, recorded runs and research outcomes are unchanged. The saved evaluation JSON was regenerated offline under v2; this is a report-format update, not a new experiment. See the additive review-v1 contract in `docs/EVIDENCE.md`.

Do not combine these axes into a single accuracy score. The evaluator performs no retrieval or model calls. Missing recorded conditions yield not_run with null metrics. A zero-denominator ratio is null, not 100%. Missing required record fields reduce completeness and fail the appropriate schema check. Null metadata counts as explicitly recorded unknown information, not as a known author/date.

| Axis | Automated measurement | What it does not establish |
| --- | --- | --- |
| Citation reference resolution | Known E/C identifiers divided by recognized E/C identifiers in the brief | Whether all material claims are cited, or a source supports one |
| Provenance completeness | Present explicit fields / ten expected fields per source | Accuracy of metadata or source independence |
| Uncertainty preservation | Retained expected qualification markers / expected markers | Properly calibrated confidence or semantic equivalence of paraphrases |
| Open-question preservation | Exact retained expected questions / expected questions | That the questions are sufficient |
| Source preservation | Expected evidence IDs present in checkpoint and snapshot / expected IDs | That retrieval occurred or the content is true |
| Handoff completeness | Present required context components / fifteen components | Useful reasoning or hidden-state recovery |
| Disposition | Matches the run's explicitly declared expected disposition | A universal assessment of research completeness |

Citation source support has two separate fields: humanSourceSupport and modelAssistedSourceSupport. The evaluator never invents judgments and leaves missing judgments null. A model review is not a human review. Source assessments should list claim/passage, supported/unsupported/uncertain judgment, rationale, reviewer type, and independence; a correctly structured unsupported claim is an intentional negative control.

The live source study contains one single-context condition and one separately authorized analyst condition, not repeated or randomized trials. Both share the three-source packet. Offline mutation cases are constructed test fixtures and are never counted as additional live agent runs or real baseline degradation. Preserve every failure/qualification in the report. A reference-marker preservation score cannot establish semantic superiority or general reliability gains.
