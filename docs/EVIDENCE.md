# Structured evidence and claims

`evidence-validate <evidence.json> [--json]` checks a versioned bundle offline. `evidence-export <evidence.json>` prints a readable Markdown ledger including supporting/contrary evidence, claim types, reasoning, and uncertainty. The schema is `schemas/0.1.0/evidence.schema.json`. See `examples/evidence/synthetic.json` for a clearly labeled synthetic fixture with an inference and inaccessible-source gap.

The bundle declares its project ID and whether it is synthetic. Each evidence record has a stable ID, source URL or path, title/author/publisher, publication/access dates, exact location, supported claim IDs, access status, limitations, and contrary evidence IDs. Unknown metadata is explicitly null. Access dates use real ISO calendar dates, even for a failed attempt. Accessible sources require an exact location; inaccessible sources require a limitation and cannot verify a claim.

Claims carry text, type (observation/quotation/inference/hypothesis), verified/unverified status, evidence IDs, underlying claim IDs, contrary evidence, reasoning, and uncertainty. Verified is an author's assertion that requires accessible evidence structurally; RAMP does not certify that assertion. Inferences require underlying claims and a reasoning step. Hypotheses cannot substitute for an observed inference basis. Cycles and unresolved references fail even for unverified claims. Record IDs are unique across the bundle.

No URLs are fetched by this validator. Source truth, quotation accuracy, independence, and actual support require source review. A structurally valid fabricated record remains fabricated; the synthetic marker is disclosure, not empirical evidence.

## Separate source-support reviews (additive contract v1)

The frozen evidence `artifactVersion: 0.1.0` contract and all old bundles remain unchanged. No migration or inferred verification occurs. Legacy `verified` is an author-declared field subject to a structural accessibility/reference condition; the ledger now displays **reference linkage** separately from **recorded source support**. With no review sidecar a claim is **not reviewed**, even if every reference is accessible and its legacy status says verified.

`schemas/0.1.0/evidence-review.schema.json` defines a new independent `reviewVersion: "1"` sidecar. Supply it explicitly:

```sh
ramp evidence-validate evidence.json --reviews evidence-reviews.json --json
ramp evidence-export evidence.json --reviews evidence-reviews.json
```

The sidecar binds `projectId` and `evidenceHash` to the exact canonical evidence bundle (`reviewHash(bundle)`: SHA-256 of stable sorted-key JSON). Each review has a unique ID, claim ID and canonical `claimHash`, supported/unsupported/uncertain assessment, reviewer type (`human`, `model`, or explicitly `unknown`) and identity, ISO timestamp, exact evidence-ID/passage-location pairs, rationale and uncertainty. Named human/model assertions require a nonempty identity; an unknown reviewer may explicitly have null identity. These are provenance assertions, not authentication or proof of reviewer independence. Missing review entries remain not reviewed. Multiple conflicting assessments are all retained and display uncertain, rather than silently choosing the newest one.

Sidecars reject stale evidence/claim hashes, unknown claims, unlinked passages, malformed timestamps and duplicate review IDs. Updating source/claim content requires new explicit review; never carry judgments onto edited assertions automatically. An unsupported claim keeps its evidence links and negative judgment. Even a recorded supported judgment does not certify factual truth or make a model judgment equivalent to human review.

See `examples/evidence/unsupported-linked.json` and its `unsupported-linked-reviews.json` sidecar: these are synthetic negative controls, not performed human/model reviews. The invented unsupported assertion passes structural linkage but displays not reviewed without the sidecar and unsupported with its explicitly synthetic assessment. Future changes to the original artifact shape require a new version and tested migration; adding a separately versioned sidecar avoids a breaking schema edit.
