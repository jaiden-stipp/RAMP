# Authoring a module

A module is a small, reviewable instruction contract. Start with one responsibility. Keep communication style separate from research method and role.

Create `modules/<kind>/<name>.json`, then add its ID to an agent in the project manifest. IDs have exactly two lowercase, hyphen-separated segments; the first is the kind. The file's `id` must match its path.

```json
{
  "id": "personas/direct-guide",
  "version": "0.1.0",
  "protocolVersion": "0.1.0",
  "kind": "personas",
  "summary": "Explain findings directly and concisely.",
  "instructions": [
    "Lead with the supported answer, then explain its evidence and limitations.",
    "Use plain language while preserving uncertainty and disagreement."
  ],
  "requires": [],
  "excludes": [],
  "capabilities": []
}
```

All fields are required. Unknown fields are rejected to catch misspellings. Every instruction and summary must be nonempty; arrays of IDs or capabilities must contain unique entries. `instructions` must have at least one entry. Dependencies and exclusions refer to module IDs, not files. Self-dependencies and self-exclusions are invalid.

`capabilities` declares tools/data access this module needs. The starter uses `source.read` and `artifact.write`; a host must document their exact meaning and restrictions. A persona MUST declare no capabilities: it only controls presentation. Capability names follow lowercase dot-separated segments, such as `source.read`.

Additive methods should say what work they require. Express known incompatibilities through `excludes`; listing the exclusion on either side is sufficient. `requires` is explicit: the user must add the dependency to the same agent's module list. The composer never adds modules behind the user's back.

Before accepting a module, review its natural-language instructions against the core and the project's boundaries. Structural checks cannot prove that prose is consistent, useful, or free from instructions that attempt to override the core. Add a focused composition test for any new structural rule or conflict.

Run `npm test` and validate a project that selects the module. Follow protocol changes with a version change and migration note. This draft supports the exact protocol version `0.1.0`; future compatibility rules are open design work.
