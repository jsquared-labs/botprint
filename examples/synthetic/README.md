# Synthetic Botprint Examples

These fixtures are generated with `bun run examples:generate`. They are deterministic, schema-valid, and intentionally synthetic. They do not contain real browser profile data from a developer machine.

## Files

- `local.profile.json`: clean local diagnostic-page profile.
- `docker.profile.json`: synthetic Docker/headless-style candidate with storage, rendering, and environment differences.
- `site-target.profile.json`: synthetic existing-target profile with `page-contamination-possible` measurement notes.
- `*.report.md`: bounded profile reports generated from the profiles.
- `*.compare.json`: compare artifacts generated from profile pairs.
- `*.compare.md`: Markdown compare reports.
- `*.agent.md`: compact agent explanations from compare JSON.

## Product Boundary

These examples are for understanding Botprint output and testing parsers. They are not examples of stealth, anti-detect configuration, or browser imitation.
