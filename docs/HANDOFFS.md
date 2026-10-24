# Handoff checkpoints and module swaps

## Compact and complete views

`ramp checkpoint preview <ramp.json> --id <id>` and `checkpoint resume` return composed instructions with a compact research summary by default. Add `--full` for the complete context/history, or `--json` for the structured response. The original `handoff --preview/--resume` JSON interfaces remain compatible. Summaries name the task/decision, uncertainty, work, open questions, next owner/action, budget, exact configuration hashes, every evidence record, contrary links, claim reasoning/caveats and source locators. Missing passage captures, publication status and content/packet hashes are explicitly labeled missing. They do not mean the sources lack that information.

The full versioned checkpoint and any context-v1 adjunct are retained together in the hash-chained task journal. Compact output explicitly omits prior event bodies, complete lock internals, repeated record fields and author/publisher metadata, and points to the full view/journal. It does not truncate/deallocate the authoritative records or restore hidden provider-session state. Historical checkpoints remain available in `ramp handoff <manifest>` and the journal after their one-time resume; previews are for pending checkpoints.

### Optional source captures and packet provenance

Pass `--context context.json` to `ramp checkpoint prepare`, or set `contextFile` in a legacy creation request. This project-relative file uses an additive, independently versioned input:

```json
{
  "contextVersion": "1",
  "sourceDetails": [{
    "evidenceId": "E-001",
    "passage": "A short passage actually captured from the source, when permitted.",
    "publicationStatus": "Record the actual classification or omit when unknown",
    "packetFile": "sources.json",
    "notes": ["Retain material source qualifications here"]
  }]
}
```

Use only real captures/metadata or clearly labeled synthetic fixtures. Passage captures are optional and limited to 2,000 characters; larger values fail rather than being silently truncated. Optional `contentHash` preserves an asserted remote-byte hash when available; it is never invented or equated to the packet hash. Missing fields normalize to null/empty. The normalizer computes local packet/input-file hashes; their files must remain project-contained and unchanged. Changing/deleting them blocks preview/resume and a host restart after a resumed enriched handoff. Audit also checks them. Full evidence/claim snapshots, contradictions and history remain authoritative even when a compact view is used.

The original checkpoint/evidence 0.1.0 shapes are unchanged. New created events optionally carry a schema-validated `contextVersion: "1"` adjunct (`handoff-context.schema.json`). Old journals load with explicit missing-detail labels; no passage/status/hash is backfilled implicitly. Preserve input revisions under new filenames.

### Reproduce the pilot formatting check

`node evaluation/handoff-context.js` reproduces `examples/pilot-citation-reliability/handoff-context-evaluation.json`. It retrospectively uses the **saved** source packet, without editing original checkpoints or making research/model calls. The compact context has 4,410 Unicode characters versus 17,965 for the full context JSON (75.45% shorter; shared instructions excluded). Token counts are unmeasured/null.

Ten declared exact-text/hash details cover three passage captures, three publication classifications, three source qualifications and the packet hash. Enriched context retains 10/10; a synthetic control removes one passage and one publication classification and retains 8/10 while keeping all source IDs. The original snapshot retains 0/10 of these exact detail strings/hashes; that is **not** zero semantic fidelity, as its existing paraphrased qualifications remain present. These checks detect specified omissions, not paraphrase equivalence, complete reasoning preservation, source truth, or improvement to the previously written briefs.

## Chained configurations

The CLI handoff store and reference host reconstruct effective configurations from the disk manifest plus **every resumed checkpoint in journal order**. Each checkpoint locks the complete source/destination configuration, including earlier swaps. Restart replays the same chain and rejects changed configurations. The disk manifest/lock remain the baseline: ordinary `compose` describes that baseline; handoff previews describe the effective destination.

The Phase 0 investigation found that the original CLI used the baseline for subsequent checkpoints after a swap. Shared reconstruction fixes this mismatch. The regression covers scout → analyst, an analyst persona swap through the CLI, analyst → reviewer through host/CLI, and restart, comparing complete destination locks and rejecting changed permissions. No research findings are involved.

The `handoff <ramp.json>` command lists checkpoints. Use `--create <request.json>`, `--preview <checkpoint-id>`, or `--resume <checkpoint-id>` for one operation at a time. Checkpoints share the task journal: recording a resume and transferring task ownership occur in one validated append. Failed creation attempts are audit events and never change the task or evidence. Checkpoint IDs are returned on creation.

The request contains taskId, fromAgent, toAgent, completedWork/openQuestions arrays, nextAction, conclusion, uncertainty, budgetUsage (`sources`, `iterations`), a project-relative evidenceFile, evidenceIds, and sameUnderlyingAgent. Optional modules explicitly selects the destination's new module set; otherwise the destination configuration is used. Optional artifacts use the task artifact reference format. `test/handoffs.test.js` is an executable synthetic example of a valid scout→analyst/persona swap and rejected swaps, including an inspectable rejected audit event; run `node --test test/handoffs.test.js`.

The source must own a nonterminal task. The checkpoint copies its task snapshot, complete validated evidence bundle, evidence/claim references, artifacts and hashes, unresolved questions, conclusions/uncertainty, budget usage, source/destination locks, and old/new module selections. A preview revalidates both configurations and compares input hashes, checks current task state and pinned files, and composes destination instructions with the restored research context. It never modifies the manifest, evidence, or past conclusions. A resume can be consumed once and updates only task ownership; retain/use the returned destination instructions for that assignment.

Budget usage is operator-declared until integrated with the shared budget ledger. It cannot exceed charter limits. Claims of independent review are not inferred from role names; same-underlying-agent checkpoints explicitly disclose self-review. This restores recorded research context, not hidden model memory or provider sessions. No credentials/environment values are collected. Do not place secrets in research text or source artifacts. Historical hashes identify records, not factual correctness or tamper-proof identity.
