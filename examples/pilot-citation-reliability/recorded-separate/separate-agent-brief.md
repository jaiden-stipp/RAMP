# Separate-agent brief: citation reliability in handoffs

**Disposition: partial against the full pilot charter; the bounded conceptual question is answered.** Schema results and provenance can establish conformance to specified checks and preserve an inspectable account of a handoff. They do not, by themselves, establish that a source supports a research claim. This last boundary is an inference from the documented purposes and scope below, not a measured reliability result.

## Observations and source-support review

Access date: 2026-10-23 in the supplied host-local context; the source packet records the same local date.

- **E-001:** Validation succeeds when applicable asserted constraints are satisfied. Section 7 also addresses defined semantic formats, so the initial hypothesis that schema validation cannot check *any* semantic property is too broad. Format-Annotation permits optional assertion behavior, disabled by default, and allows uneven support; Format-Assertion requires assertion and defined syntactic checks, or refusal when required support is unavailable. Thus a claimed format check must identify its vocabulary and implementation configuration. Source: Wright, Andrews and Hutton, *JSON Schema Validation*, published 2022-06-16, Internet-Draft/work in progress, [sections 3, 7.1, 7.2.1 and 7.2.2](https://json-schema.org/draft/2020-12/json-schema-validation). These passages support specified validation behavior, not arbitrary claim-to-passage entailment.
- **E-002:** Provenance describes production history and supports assessments of quality, reliability and trustworthiness. The text does not present the mere existence of a provenance record as a guarantee. Source: Groth and Moreau, editors, W3C, *PROV-Overview*, 2013-04-30 Working Group Note, [Abstract and section 1](https://www.w3.org/TR/prov-overview/). This is a non-normative overview.
- **E-003:** PROV models entities, activities and agents and their relations. A bundle represents provenance as an entity, permitting attribution and generation history for the provenance itself. Source: Moreau and Missier, editors, W3C, *PROV-DM*, 2013-04-30 Recommendation, [sections 2.1 and 2.2.2](https://www.w3.org/TR/prov-dm/). Section 2 is informative, as the page's compliance/structure passages confirm. It supplies concepts for recording lineage, not evidence that a particular lineage record is true.

## Implications for RAMP maintainers — inference and recommendation

Keep three judgments distinct: **schema conformance**, **preservation of recorded information**, and **source support**. A handoff may pass declared field/format checks yet carry a mistaken claim. Equally, an accurately preserved record may faithfully retain an earlier mistake. These are illustrative possibilities, not observed failures in this condition. They follow from the separation between validation scope and provenance's assessment role (E-001/E-002/E-003).

Preserve the schema/dialect, validator version/options and result; claim text; evidence ID, source version or capture, URL and passage locator; transformations and responsible agent/activity; and the source-review decision with its reasons and uncertainty. Also preserve who produced the review record and when (a provenance-of-provenance application). These are proposed review fields, not requirements imposed by these sources (E-001/E-002/E-003). Byte or field comparisons could test preservation against a retained reference; a separate claim-to-passage review must assess support, scope and contradiction. Neither test was executed here.

## Limits, open questions and handoff

Confidence is high in the narrow reading of the examined passages; confidence in practical effectiveness is unmeasured. These are specification/concept documents, not experiments on RAMP handoffs. E-002 and E-003 belong to the same standards family and are not independent empirical corroborations. No conclusion about a general improvement in reliability, model rankings or all research domains follows.

Open questions: Which concrete schema and validator settings does RAMP use? Which source snapshots and record fields survive its actual handoff? What review rubric and human adjudication distinguish unsupported, overstated and contradicted claims? Implementation evidence and evaluated cases could change operational conclusions; those are outside this packet.

This condition produced one brief with one manual, model-performed source-review workflow, in two cycles (initial inspection and targeted verification). It reopened exactly the three supplied primary URLs, added zero distinct sources, and stopped acquisition at the three-source limit. No subagents, paid services, external model APIs, timed trial, validator test or preservation replay were used. No independent human review or measured comparison was performed. Self-review checked the claim/source distinctions above. The other condition's brief, self-review and evidence files were not read before writing this answer.

This is a separate model context with inherited session settings; its exact model identifier is not exposed. Next owner: parent pilot coordinator, to review this brief, integrate condition/handoff records and determine full-charter acceptance. This brief alone does not certify those acceptance conditions.

Local input SHA-256 values (hashes of local files, not fetched webpage bytes):

- `charter.md`: `6ae91dcbc2957bed44f7c0a8d8f8eb549a4dc5075a8e819598b1d1b1ce639caa`
- `sources.json`: `df70af385551708e973c3b9e4cafdf4fddcbdcba1b3ccf0f9c650bb4313a1a77`
- `analyst-instructions.md`: `e58ec75499a2efa32a6458705be9b44cb6a16572e2882c108701fcdf75860fcf`

Configuration hashes reported by the supplied instructions, not independently recomputed: manifest `7b8f61c947d72b33298606a6ef8a1290cebf8ec0a6a4a69bf3ae223c3e6e0526`; core `ae79c652c6e7a8804436c0e6b821562e606b49440677ef4c7335640fcd384862`.
