# Optional OpenAI Agents SDK integration

This example uses the **real Agents SDK** (`@openai/agents` **0.21.0**, Zod **4.6.7**, pinned in its own lockfile), with RAMP as the local protocol/mediation library. By default its actual Agent/Runner/tool loop runs against a deterministic implementation of the SDK Model interface. This is conformance testing, not model research or a paid demonstration. Dependencies are isolated here; the core has no provider dependency.

From a fresh checkout with Node.js 22+:

```sh
npm ci
# Create an output parent, such as dist, if it does not already exist.
cd examples/agents-sdk
npm ci
npm test
npm run demo -- "../../dist/my SDK research"
```

The destination must be new and its parent must exist. No keys are needed. This private local package links `ramp-protocol` through `file:../..`; no npm publication is assumed. The core also exposes a draft API through a locally installed tarball: `import { ReferenceHost } from 'ramp-protocol'`.

## End-to-end flow

1. The trusted application initializes/locks a synthetic project, creates a scoped task, records charter/plan gates and starts a budgeted cycle.
2. The SDK scout calls `ramp_request({tool, resource})`. The adapter binds agent/task IDs **outside model arguments** and routes calls through `ReferenceHost.requestTool`. The trusted handler serves only `fixture:source-a` from a synthetic packet. Extra gateway arguments fail schema validation.
3. The offline script requests an allowed read, a forbidden resource and an unconfigured tool. Successful tool/result hashes, denials and budget reservations remain inspectable in host/budget journals. The SDK receives structured success or denial results. Unknown SDK tool names fail before trusted handlers.
4. The application saves transcripts and structured evidence for successful reads only. It infers no claims or support judgments from model prose. It advances to analysis, checkpoints evidence/uncertainty/questions/source-packet hashes and a teaching persona, transfers ownership, and restarts the host.
5. A new analyst SDK assignment receives current instructions plus saved handoff context. Re-reading a recorded source does not charge another unique source. Analysis evidence is a new revision, preserving checkpoint inputs. The workflow advances to review and stops **pending human review** with unverified notes and a combined audit. Separate SDK objects do not prove independent verification.

Inspect `sdk-scout.json`, `sdk-analyst.json`, `evidence.json`, `analysis-evidence.json`, `source-context.json`, `analysis.md`, `integration-report.json` and `.ramp/` in the generated project. Continue manually with `ramp task inspect <manifest> --id T-sdk` and the walkthrough's review/delivery commands.

## Adapter contract

`runAssignment({host, agentId, taskId, model, input, signal})` defines one SDK function tool. The SDK Runner owns model turns/dispatch; RAMP owns the configured mediation/state boundary. Replace the scripted Model or trusted `tools` map with reviewed implementations rather than generic fetch/shell/filesystem executors. Gate transitions and checkpoints in this example are trusted application/operator actions, not automatic assertions of finished research from model prose. Native SDK handoffs/session restoration are not translated automatically; use explicit RAMP checkpoint boundaries and new assignments.

AbortSignals propagate through the SDK and host to handlers. An operator-aborted run records task cancellation and charged begun attempts. Cancellation is cooperative: handlers must honor the signal; arbitrary JavaScript cannot be forcibly stopped. Max-turn/provider errors do not grant access, retry automatically or approve results.

RAMP enforces assignments, capabilities, exact resource/input scope, phase/status gates and source/iteration accounting **only for requests routed through this host**. The trusted application owns handler correctness, record persistence and SDK/model configuration. It does not sandbox the SDK/application, constrain provider internals, verify prose, authenticate reviewers or enforce a dollar/token budget. Do not add unmediated SDK tools, hosted browsing, MCP or handoffs that bypass the boundary.

## Offline CI

`npm test` runs the real SDK with scripted models and a process-local guard rejecting fetch/HTTP/TCP/TLS attempts. Tracing is explicitly disabled. Tests require no credentials and assert zero network attempts. A separate CI job tests Node.js 22/24:

- Allowed/denied calls, SDK result propagation, evidence/task persistence, checkpoint/restart consistency and pending review.
- Unknown SDK tools, extra assignment arguments, forbidden capabilities and blocked phases never invoke handlers.
- Pre-start/in-flight cancellation, signal propagation, durable state and budget outcomes.
- Incomplete live authorization is rejected before provider calls.

Package installation needs npm registry access; the conformance runs themselves do not.

## Optional live path — not run during implementation

Only after the operator authorizes spending, sets a provider-side budget, chooses an account-available model and configures `OPENAI_API_KEY`:

```sh
npm run demo -- "../../dist/my live SDK exercise" --live --allow-paid --model <explicit-model-id>
```

All three flags plus credentials are required. No live default or fake-to-live fallback exists. This still uses the synthetic local packet and sends its instructions/context to the configured provider. Each assignment is limited to six SDK turns and requests at most 256 output tokens per call; these are **not dollar caps** or guarantees about billed input/reasoning tokens. No retries are enabled by this example. Tracing stays disabled. Live output can differ, deny requests or hit limits. No live model call or paid experiment was performed to implement/test this example.

The adapter follows the official [Agents SDK overview](https://developers.openai.com/api/docs/guides/agents/sdk), [JavaScript quickstart](https://developers.openai.com/api/docs/guides/agents/quickstart?lang=javascript) and [models/providers guide](https://developers.openai.com/api/docs/guides/agents/models). Exact Model/Runner/tool signatures were checked in the locally installed pinned SDK declarations. Re-run conformance before upgrading.
