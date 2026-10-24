# Contributing

RAMP is an early draft. Start with a concrete research workflow, a failure mode, or a small module that can be evaluated.

For protocol changes, explain the current problem, proposed requirement, compatibility impact, and an example. Keep research integrity in the core, project boundaries in the charter, and optional behavior in modules.

For code changes, use Node.js 22 or later, install pinned dependencies with `npm ci`, run `npm test` and `npm run validate`, and check the generated bundle with `npm run compose`. Ajv and ajv-formats provide schema and format validation; keep new dependencies justified and locked.

Do not add credentials, private research data, or misleading example findings. Label synthetic examples clearly. No license has been selected; agree on contribution and distribution terms before accepting outside contributions.
