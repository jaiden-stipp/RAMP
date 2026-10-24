# Structured evidence and claims

`evidence-validate <evidence.json> [--json]` checks a versioned bundle offline. `evidence-export <evidence.json>` prints a readable Markdown ledger including supporting/contrary evidence, claim types, reasoning, and uncertainty. The schema is `schemas/0.1.0/evidence.schema.json`. See `examples/evidence/synthetic.json` for a clearly labeled synthetic fixture with an inference and inaccessible-source gap.

The bundle declares its project ID and whether it is synthetic. Each evidence record has a stable ID, source URL or path, title/author/publisher, publication/access dates, exact location, supported claim IDs, access status, limitations, and contrary evidence IDs. Unknown metadata is explicitly null. Access dates use real ISO calendar dates, even for a failed attempt. Accessible sources require an exact location; inaccessible sources require a limitation and cannot verify a claim.

Claims carry text, type (observation/quotation/inference/hypothesis), verified/unverified status, evidence IDs, underlying claim IDs, contrary evidence, reasoning, and uncertainty. Verified is an author's assertion that requires accessible evidence structurally; RAMP does not certify that assertion. Inferences require underlying claims and a reasoning step. Hypotheses cannot substitute for an observed inference basis. Cycles and unresolved references fail even for unverified claims. Record IDs are unique across the bundle.

No URLs are fetched by this validator. Source truth, quotation accuracy, independence, and actual support require source review. A structurally valid fabricated record remains fabricated; the synthetic marker is disclosure, not empirical evidence.
