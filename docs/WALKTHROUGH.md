# First manual research workflow

This exercise is synthetic and uses no model or external service. Install/link the local package as described in the README. Replace the exercise question, artifacts, judgments and evidence with actual research when using it for a real project. A gate checks files and workflow state, not the quality of their content.

```sh
ramp init "my research"
cd "my research"
# Edit ramp.json: actual question, boundaries, permissions, limits, stop conditions.
ramp validate ramp.json
ramp lock ramp.json
ramp task create ramp.json --id T-1 --owner scout --question "Demonstrate a bounded manual workflow" --output "Partial report" --criterion "Disclose evidence gaps"
ramp task inspect ramp.json --id T-1
ramp task activate ramp.json --id T-1 --dry-run
ramp task activate ramp.json --id T-1
```

Write `charter.md` describing the question/boundaries, then `plan.md` describing the research strategy. Paths below are relative to the project and must refer to existing files. No JSON event files are needed. `inspect` reports current owner/status, the next phase and required gate, pending checkpoints, and remaining shared budget. `--help` works on every operation.

```sh
ramp task advance ramp.json --id T-1 --artifact charter.md
ramp task advance ramp.json --id T-1 --artifact plan.md
# If blocked:
ramp task block ramp.json --id T-1 --blocker "Missing source" --until "Source supplied"
ramp task activate ramp.json --id T-1 --resolution "Source supplied"
```

Gather actual evidence within the project budget or explicitly report that this exercise has none. The existing `budgets --event` interface records manual budget reservations; the reference host mediates/counts actual tool operations. Guided task changes do not run research or pretend to have charged tools. Create a structured `evidence.json` using [the evidence contract](EVIDENCE.md). For this empty synthetic exercise only, use the following, replacing the project ID with `project.id` from your manifest:

```json
{"artifactVersion":"0.1.0","projectId":"my-research","synthetic":true,"evidence":[],"claims":[]}
```

```sh
ramp evidence-validate evidence.json
ramp task advance ramp.json --id T-1 --artifact evidence.json
ramp checkpoint prepare ramp.json --task T-1 --from scout --to analyst --evidence evidence.json --completed "Recorded an empty synthetic exercise" --question "No external evidence collected" --next "Document limitations" --conclusion "No real finding" --uncertainty "No semantic review performed" --same-agent
# Copy the checkpoint ID returned above:
ramp checkpoint preview ramp.json --id <checkpoint-id>
ramp checkpoint resume ramp.json --id <checkpoint-id>
```

Use `--module` repeatedly to explicitly replace the destination's complete module list. With no budget journal, `--sources-used` and `--iterations-used` assert manual counts (defaults are zero); an existing budget journal always takes precedence. `--same-agent` discloses reused context; it does not provide independence. Actors are local assertions, not authenticated identities. Guided task operations cannot change owners directly; ownership moves through validated checkpoint resume. Low-level event APIs remain available for trusted automation.

Write `analysis.md`, record a review in `review.md`, then write `brief.md` and `delivery.md` with a partial disposition and unaddressed questions. A separate human/model reviewer must actually review the work; use `--self-review` whenever the reviewer is the owner or the review reuses the same underlying context.

```sh
ramp task advance ramp.json --id T-1 --actor analyst --artifact analysis.md
# To request changes (returns to analyze by default; --return-to selects an earlier phase):
ramp task review ramp.json --id T-1 --reviewer analyst --self-review --outcome changes_requested --issue "Explain the missing evidence" --artifact failed-review.md
# Revise analysis.md and submit again:
ramp task advance ramp.json --id T-1 --artifact analysis.md
ramp task review ramp.json --id T-1 --reviewer analyst --self-review --outcome approved --artifact review.md
ramp task advance ramp.json --id T-1 --artifact brief.md
ramp task complete ramp.json --id T-1 --artifact delivery.md --criterion "Disclose evidence gaps" --disposition partial
ramp task inspect ramp.json --id T-1
```

Completion requires explicit acceptance of every criterion, an approved review, and a delivery artifact. It never certifies factual correctness. Existing artifacts referenced by checkpoints must remain unchanged; write revisions under new filenames when preserving old checkpoint inputs. `tasks --event`, `handoff --create/--preview/--resume`, and `budgets --event` remain supported for automation.
