# Local configuration builder

Run from the RAMP checkout with Node.js 22 or later:

```sh
npm ci
npm run builder
# Or open a particular valid project / recipe:
npm run builder -- recipes/technical-feasibility/ramp.json --port 4173
```

Open **http://127.0.0.1:4173** in your browser. The default is the literature-review example. The server binds only to `127.0.0.1`; another port between 1024 and 65535 may be selected. Stop it with Ctrl+C. No credentials, model APIs, external assets, telemetry, or agent execution are involved.

1. Edit the project charter, explicit permission ceiling, source/iteration limits, and stop conditions.
2. Select an active agent or add one. Choose exactly one role, any compatible methods, at most one persona, and at most one output. Selecting a new role/persona/output replaces the previous selection in one action; optional persona/output checkboxes can also be cleared. Roles use native radio controls (arrow keys switch roles); methods remain independent checkboxes. Module details show version, origin, requirements, exclusions, capabilities, and instructions. Dependencies are not silently selected.
3. Resolve the inline explanations. The shared CLI validator checks schemas, module identity, dependencies, exclusions, role cardinality, and capabilities. Invalid or pending configurations disable export. Error links select the affected agent. Shared core rules remain read-only, and the permission ceiling is visible above the charter as modules change.
4. Inspect each agent's complete instructions and changes relative to the project opened at server startup. Swapping a persona changes communication instructions; it does not remove core rules or grant capabilities. A manifest editor also supports local JSON editing/pasting.
5. Export `ramp-configuration.zip`. Extract into a new directory. It contains `ramp.json`, `ramp.lock.json`, `instructions/all-agents.md`, `instructions/agents/<agent-id>.md`, and every selected project-local module under `modules/`.

The opened project is never overwritten. Edits live in the browser until exported; reloading discards them. JSON validation/export requests go only to the local server. There is no upload to an external service, persistence dashboard, marketplace, authentication, or model launcher.

## Use the export

From the same RAMP checkout, substitute the path to the extracted manifest:

```sh
node src/cli.js validate <export-directory>/ramp.json --locked
node src/cli.js compose <export-directory>/ramp.json --locked --agent scout
```

The manifest resolves built-in modules through the installed RAMP checkout and custom modules through the opened project's `modules/` directory. Exports carry selected custom modules, with their original hashes. Recipients need the matching core and built-in module versions; the lock detects differences and must not be silently refreshed. The builder does not discover arbitrary filesystem paths supplied by browser requests. To change the local module directory, restart with a different manifest. Restart to establish a new change baseline after intentional file edits.

## Accessibility and verification

The interface uses labeled native inputs, checkboxes, buttons, selects, and disclosures, a skip link, visible keyboard focus, keyboard-scrollable core/preview text, and a live validation region with navigable error links. Tab moves through controls; Space toggles checkboxes/disclosures; native select keys change agents. Layout adapts to a single column on narrow windows.

Automated tests extract exported ZIPs, validate/compose them through the actual CLI in locked mode, include custom modules, reject incompatible selections and capability expansion, check persona/core preservation, and exercise same-origin, host, route, malformed-body, and size restrictions. Browser verification covered module selection, an inline missing-dependency error with disabled export, Space-key recovery, and a persona swap with a readable change preview. These checks establish configuration consistency, not semantic correctness of research or instruction obedience in external hosts.

The server has a strict asset allowlist, a same-origin content policy, exact loopback-host checks, same-origin JSON POST checks, and a 1 MiB request-body limit. It is a local authoring tool, not a remotely exposed service.

Selection regression check (#16): in Chrome, arrow keys switched scout → reviewer → analyst with one role selected; Space selected a second method and replaced the persona and output across category switches. The downloaded ZIP retained evidence-first + source-quality, teaching-guide, and literature-map with exactly one analyst role; extraction passed CLI locked validation and matched the combined composition byte-for-byte. Automated selection tests also verify dependency/capability failures remain blocking.
