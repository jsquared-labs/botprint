# Contributing

Botprint is a small, focused tool. Pull requests should keep it that way: one concern per PR.

Botprint reports what a browser exposes and what differs between environments, and names the likely cause. It does not ship spoofing presets or patches, and findings should stay evidence-based: a finding names a signal, the evidence, and the launch option or environment difference that commonly produces it.

## Architecture rules

- `probe.ts` collects raw signals and never interprets them.
- Profile JSON is the durable contract. `findings.ts`, `compare.ts`, and `render.ts` are pure functions over it.
- New signals go into the schema in `profile.ts` with a `schema_version` bump, the fixture in `tests/fixtures/profile.ts`, and the generator in `scripts/generate-examples.ts`.
- Finding IDs, diff IDs, warning IDs, severity values, and exit codes are stable once released. Add new ones; do not rename.

## Before you submit

```bash
bun run check               # typecheck + tests
bun run examples:generate   # if findings, compare, render, or the schema changed
bun run smoke:local         # if the probe or CDP client changed; needs a local Chrome
bun run build               # if anything touches the compiled-binary path
```

Do not commit generated profiles, reports, logs, or secrets. Curated examples live under `examples/` and fixtures under `tests/fixtures/` only.

## What reviewers look for

- Are findings evidence-based, with a concrete common cause?
- Does the stable contract still hold for existing consumers?
- Are errors and exit codes useful to both humans and agents?
- Is generated data clearly separated from source fixtures?
