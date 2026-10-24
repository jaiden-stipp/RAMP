# Reproducible configurations

`node src/cli.js lock <ramp.json>` creates `ramp.lock.json` beside the manifest and refuses an existing lock. `validate` and `compose` accept `--locked`; missing or mismatched locks fail without modifying any files. Ordinary unlocked composition still works.

Inspect proposed changes with `node src/cli.js diff <ramp.json>`. The JSON report identifies manifest/core changes, agent selections, added/removed modules, origin/version/content changes, and changed instruction/summary/dependency/exclusion/capability fields. Changed fields include their current values for review. Refresh only with `node src/cli.js lock <ramp.json> --update`, which reports changes and atomically replaces the lock. Commit the lock with the project.

Hash policy `sha256-utf8-bomless-lf-v1` strips a leading UTF-8 BOM and converts CRLF or lone CR to LF before hashing text. JSON whitespace/order changes still count as edits. Existing pre-lock bundles used raw-byte hashes and should be recomposed. Locks generated from the same text on Windows/Linux agree regardless of checkout line endings. Hashes identify input content, not its semantic correctness or trustworthiness.

Locks contain protocol/format/policy identifiers, input hashes, agent selections, portable module origins/versions, and per-field hashes. They do not copy instruction payloads, absolute paths, environment values, credentials, or external model sessions. IDs and origins must follow the module contract. There is no registry, signature verification, range solver, or automatic refresh.
