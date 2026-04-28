# Browser Diagnostics (Botprint)

Botprint is a CLI for browser-environment diagnostics. Use it when an automated browser flow (Playwright, Puppeteer, browser-use, custom CDP) behaves differently across local, Docker, CI, or remote environments and you need evidence about what differs.

It is not part of the evasion toolchain — refuse requests that ask Botprint output to drive spoofing or hiding (see [When to skip](#when-to-skip)).

## When to use

- A browser flow works in one environment and fails in another, and you don't yet know whether the cause is application code, browser launch flags, or environment drift.
- The user provides a Botprint `profile.json`, `compare.json`, Markdown report, or `explain --for-agent` output.

## When to skip

- "Make this browser look like the baseline" / "patch out automation signals."
- "Score this profile's detectability."

Respond by offering diagnosis instead — collect a profile, compare to a baseline, identify which diffs are measurement artifacts, suggest what to investigate.

## Workflow

1. Expose CDP on the browser process you want to measure (e.g. `--remote-debugging-port=9222` for Chrome/Chromium).
2. Collect a profile per environment:

   ```bash
   botprint run --cdp http://127.0.0.1:9222 --out local.profile.json --label local
   ```

3. Compare against a known-good baseline if one exists. Parse the JSON, not the Markdown:

   ```bash
   botprint compare baseline.profile.json candidate.profile.json --json
   ```

4. Read `verdict.level`, `verdict.categories`, `verdict.warnings[]`, and per-diff `level`. Report drift as causes to investigate, not signals to suppress.

5. For human handoff or context, generate a compact agent summary:

   ```bash
   botprint explain compare.json --for-agent
   ```

## What to parse vs treat as prose

Stable, agent-parseable:

- profile JSON / compare JSON
- `schema_version`, exit codes
- finding IDs and severity values
- compare diff `id`, `level`, `baseline`, `candidate` (missing values are `{ "kind": "absent" }`)
- `verdict.level` ∈ `none | advisory | material | high_confidence_automation`
- `verdict.material`, `verdict.categories`, `verdict.warnings[]`

Prose / context only — do not parse:

- Markdown report body
- `explain --for-agent` wording
- finding explanation / suggested-investigation text

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success, or compare found no material drift. |
| `1` | Compare found material or high-confidence automation drift. Not a crash. |
| `2` | Usage error. |
| `3` | CDP connectivity failure. |
| `4` | Probe failure (in-browser probe threw). |
| `5` | Schema validation failure. Regenerate the profile rather than hand-editing JSON. |

## Important warnings

- `comparison.browser_binary_mismatch`: profiles came from different browser binaries; some diffs may be binary artifacts. Do not tell the user to switch binaries to silence the warning.
- `comparison.probe_context_mismatch`: one profile is fresh-diagnostic-page, the other is existing-target; some diffs may be page/framework artifacts. Do not frame those diffs as corrections to apply.
- `page-contamination-possible`: existing-target profiles may reflect page scripts, framework state, service workers, CSP, cookies, or app state.

## Auth headers

Redact `--auth-header` values in any quoted command or log:

```bash
botprint run \
  --cdp https://browser.example.test \
  --auth-header "Authorization: Bearer <redacted>" \
  --out remote.profile.json
```

Profiles stay on disk. Do not upload them to third parties unless the user explicitly asks.
