# Schemas and diagnostics

Install the pinned dependency tree with `npm ci` (Node.js 22+). Runtime validation uses Ajv 8 and ajv-formats 3, declared in package.json and pinned by package-lock.json. They implement JSON Schema draft-07 and standard date/URI checks; the CLI never downloads schemas.

Versioned schemas are in `schemas/0.1.0/`. The repository's `.vscode/settings.json` associates them with manifests and modules for completion in VS Code. For an external project, configure `json.schemas` in your editor with an absolute path to the installed schema and a `fileMatch` for your manifest. Do not add `$schema` to the manifest: the 0.1.0 contract still rejects unknown fields.

`node src/cli.js validate <ramp.json> --json` writes one JSON object to stdout: `valid`, optional `project`, and `diagnostics`. Failures exit nonzero. Each diagnostic has a stable `code`, source `file`, JSON Pointer `path` (empty means the document root), and readable `message`. Structural errors are accumulated. JSON syntax and file errors have `JSON_SYNTAX` and `FILE_READ` codes. Semantic errors use `SEMANTIC_CONSTRAINT`; structural codes have a `SCHEMA_` prefix. Human-readable validation and composition commands remain supported.

Schemas are the structural contract. Unique agent IDs, module/file identity, kind/ID agreement, role/persona/output cardinality, explicit dependencies, exclusions, persona capabilities, and the project permission ceiling also need semantic validation. Structural traceability never proves that instructions are consistent or research conclusions are correct.
