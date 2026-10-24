# Pilot report

Disposition: completed bounded source study and reproducible preservation evaluation; general reliability advantage remains **unestablished**. One drafting workflow per condition, one unblinded cross-review, and one later analyst preservation inspection were recorded. These are not repeated trials. No human source-support judgment, randomized baseline, external model API, paid experiment, or timing/accuracy benchmark was run.

The source question is answered in the original briefs, with E/C identifiers resolved through evidence.json and precise links/sections in sources.json. A useful correction was observed: the initial universal assertion about schema semantics was too broad. The separate reviewer accepted the qualified source observations while distinguishing implementation claims, design inference, and unaudited workflow reports. See self-review.md, separate-review.md, and source-review.json. Original briefs are preserved, including the single-context brief's present-tense RAMP capability wording that the reviewer considered unverified by the source packet.

## Reproduced offline observations

`node evaluation/run.js` produces evaluation-results.json. These counts describe the stored artifacts, not live reasoning accuracy.

| Check | Single context | Separate analyst context |
| --- | --- | --- |
| Resolved E/C identifiers in brief | 4/4 | 11/11 |
| Explicit provenance fields | 30/30 | 30/30 |
| Declared source IDs in checkpoint | 3/3 | 3/3 |
| Declared uncertainty markers | 3/3 | 3/3 |
| Declared open questions | 2/2 | 2/2 |
| Required handoff components present | 15/15 | 15/15 |
| Human source-support score | Not assessed | Not assessed |

Disposition checks match each author's declared scope: single-context complete for the narrow answer, separate-context partial for the broader charter. These different scopes are not comparative success/failure outcomes. Source-support judgments remain qualitative model assessments in a separate field; there is no fabricated human score or combined quality percentage.

Both saved workflows account for three unique sources and two cycles. A replay reconstructs manual records after the actual source reading; it does not demonstrate that a host enforced the original web/model calls. The stored handoff restored all declared markers. The analyst explicitly observed that this handoff arrived after its initial brief and therefore cannot explain that brief's quality.

## Negative findings and limits

- The later analyst inspection found missing source excerpts, some publication-status detail, and absent source-packet/instruction-file hashes. The checkpoint accurately represents an earlier stage; its missing completed-brief conclusions and later cycle count are not proven serialization losses.
- Completeness scores still reach 15/15 and 30/30 despite these omissions. The rubric measures its declared contract, not full context fidelity. Exact-marker matching also misses paraphrased or newly raised questions.
- An intentionally unsupported but well-formed claim passes structural validation and reference resolution. Its source-support judgment remains null. This is a synthetic negative control, not an actual source observation or model output.
- Other synthetic controls expose a missing locator (29/30 provenance fields and contract failure), dropped qualifications (0/3), dropped questions (0/2), and mismatched disposition. These are five offline mutations, never five extra research runs.
- The same curated packet constrains both outputs; two sources share a standards family. The reviewer saw labels and supplied claims. Brief lengths, prompts, available context, and disposition scopes differ. Exact model versions and full remote source bytes were unavailable. No causal or general performance gain can be inferred.

## Follow-up changes grounded in observations

1. Preserve source-packet hashes and optional passage captures/publication status in handoffs; the analyst identified missing details despite high field-presence scores.
2. Add declared task/disposition scope to evaluation records; the reviewer found that the two dispositions used different denominators.
3. Separate snapshot-time preservation from completed-work preservation, and test both; an earlier checkpoint cannot be judged as a finished analyst handoff.
4. Plan blinded, repeated, cross-topic cases with human source-support adjudication and an explicitly pinned host/model/budget before claiming reliability improvements. Such experiments were not performed here.

The demonstrated value is inspectable configuration/evidence context, reproducible checks, and retention of negative findings. Broader interoperability and runtime behavior are subsequent engineering milestones, not conclusions supplied by this pilot.
