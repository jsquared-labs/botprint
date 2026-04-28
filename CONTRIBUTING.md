# Contributing

Botprint is a small, focused tool. Pull requests should keep it that way.

Botprint provides browser-environment diagnostics, comparison, and reproducible evidence. Changes should not add target-site bypass guidance, stealth presets, CAPTCHA workflows, or recommendations for evading detection systems.

Use evidence language: browser-visible signals, automation exposure, compatibility risk, environment consistency, material baseline difference. Avoid: stealth score, undetectable, bypass, evade.

## Pull Requests

Keep changes small and focused. One concern per PR. The PR template's Product Boundary checkboxes need to be honest — if a change drifts toward evasion territory, say so and explain.

## Commit Hygiene

- Every commit should pass `bun run check`.
- Commits that affect the compiled binary path should also pass a `bun build --compile` smoke.
- Don't commit generated profiles, reports, logs, temp files, or secrets. The `.gitignore` covers the common cases; if you produce a new artifact type, add it there.
- Curated examples and fixtures belong under `examples/` or `tests/fixtures/` only.

## What Reviewers Look For

- Does this stay within diagnostics rather than drifting toward evasion?
- Are findings evidence-based rather than speculative?
- Does output describe investigation rather than corrections to apply?
- Are errors and exit codes useful to humans and agents?
- Is generated data clearly separated from source fixtures?

## Testing

Before submitting:

```bash
bun run check
```

If your change affects the compiled binary path:

```bash
bun build --compile src/cli.ts --outfile /tmp/botprint
```
