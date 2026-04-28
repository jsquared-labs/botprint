# Botprint

Botprint shows what your automated browser exposes to the web, and what changed from your baseline.

It is a diagnostic tool — it reports browser-visible signals and compares profiles. It does not generate stealth presets, patches, or detection-bypass guidance.

## What It Does

Botprint connects to an existing browser through Chrome DevTools Protocol (CDP), runs a browser-visible probe, and writes a schema-versioned JSON profile. It can then render reports, compare profiles, and produce compact agent-friendly explanations.

The primary workflow is agented browser debugging: a human or coding agent runs Botprint against the browser context that is failing, compares it with a known-good baseline, and uses structured output to reason about environment drift before changing application code.

Use Botprint to investigate:

- local vs Docker browser drift
- local vs CI browser drift
- Playwright, Puppeteer, browser-use, Stagehand, or custom CDP behavior
- remote browser surprises
- browser-visible capability differences in storage, rendering, permissions, WebRTC, identity, environment, and automation exposure

## What The Output Looks Like

A single-profile report from one browser context (synthetic Docker example):

````markdown
# Botprint Profile: synthetic-docker

## Summary
- Browser: HeadlessChrome/145.0.0.0
- Target: http://host.docker.internal:45002/
- Findings: 2

## Browser Context
- User agent: Mozilla/5.0 (Synthetic) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36
- Platform: SyntheticPlatform
- Timezone: UTC
- Viewport: 1280x720 @ 1

## Key Signals
- WebDriver: false
- WebGL: SwiftShader Device (Synthetic)
- Canvas: stable
- Storage: cookies=true, indexedDB=error

## Top Findings
- **Software WebGL renderer detected** (warning): Renderer evidence: WebKit WebGL SwiftShader Device (Synthetic).
- **IndexedDB is unavailable** (compatibility_risk): IndexedDB status is error.

## Suggested Investigation
- Check whether the candidate ran in headless, Docker, CI, or a GPU-disabled environment.
- Check browser policy, incognito-like modes, and origin/storage restrictions in the candidate environment.
````

Comparing two profiles surfaces drift between environments:

````markdown
# Botprint Compare: synthetic-local -> synthetic-docker

## Summary
- Verdict: material
- Material: yes
- Differences: 15
- Categories: cdp, environment, identity, permissions, rendering, storage
- Warnings: comparison.browser_binary_mismatch

## Top Differences
_Showing top 5 of 15 differences. Use `--json` for the full diff list._
- **Timezone changed** (material): signals.environment.timezone "America/New_York" -> "UTC"
- **WebGL renderer changed** (material): signals.rendering.webgl.unmasked_renderer "ANGLE Metal Renderer: Synthetic GPU" -> "SwiftShader Device (Synthetic)"
- **IndexedDB availability changed** (material): signals.storage.indexed_db "available" -> "error"
- **Service worker availability changed** (material): signals.storage.service_worker "available" -> "unavailable"
- **User agent changed** (advisory): signals.identity.user_agent "...Chrome/147.0.0.0..." -> "...Chrome/145.0.0.0..."
````

The agent-friendly explanation (`explain --for-agent`) condenses the same finding into one paragraph under a 200-word budget. Profile JSON and compare JSON are the stable parsing surfaces; Markdown and agent prose are for humans and LLM context.

Synthetic deterministic fixtures live in [`examples/synthetic`](examples/synthetic). Regenerate them with `bun run examples:generate`.

## Where This Sits

Botprint reads browser-visible signals — the same surface any page script can read about itself. It's introspection, not modification. It doesn't ship spoofs, patches, or evasion recipes, and won't generate them on request.

## Agented Coding Workflows

Botprint is designed to be useful inside Codex, Claude Code, Cursor, and other coding-agent workflows.

Agents should parse JSON and exit codes, not scrape Markdown prose:

- profile JSON for the browser-visible environment
- compare JSON for baseline drift
- `verdict.level`, `verdict.categories`, `verdict.warnings[]`, and per-diff `level`
- `targets --json` when an agent needs a page target ID without parsing table output
- `explain --for-agent` when a compact human-readable handoff is useful

For local personal use, Botprint can also be wrapped by Codex/Claude skills. See [`docs/agent-usage.md`](docs/agent-usage.md) for the stable contract, refusal boundary, Playwright CDP recipe, and fresh-vs-existing-target guidance.

## Install

Botprint is currently built with Bun.

```bash
bun install
bun run check
bun run build
```

The compiled binary is written to:

```bash
dist/botprint
```

You can also run from source:

```bash
bun run src/cli.ts help
```

## Quickstart

Start Chrome or Chromium with a CDP port, then collect a profile:

```bash
dist/botprint run \
  --cdp http://127.0.0.1:9222 \
  --out local.profile.json \
  --label local
```

Render a Markdown report:

```bash
dist/botprint report local.profile.json --markdown local.report.md
```

Compare two profiles:

```bash
dist/botprint compare baseline.profile.json candidate.profile.json --json
```

Generate an agent-friendly explanation:

```bash
dist/botprint explain candidate.profile.json --for-agent
```

Use the guided terminal flow:

```bash
dist/botprint guide
```

`botprint tui` is an alias for `botprint guide`.

## Commands

| Command | Purpose |
| --- | --- |
| `run` | Collect a profile from an existing CDP endpoint. |
| `targets` | List existing page targets from a CDP endpoint; use `--json` for scripts and agents. |
| `report` | Render a Markdown report from a profile. |
| `compare` | Compare a baseline profile against a candidate profile. |
| `explain` | Render a compact agent-friendly diagnosis. |
| `guide` | Run a guided terminal flow over the same commands. |

Command help:

```bash
dist/botprint help run
dist/botprint help targets
dist/botprint help compare
```

## Fresh vs. Existing Target

By default, `botprint run` creates a fresh diagnostic page in the browser and runs the probe there. This is cleaner and more repeatable, and it is the best mode for baseline drift.

When you need to measure an already-open page, list targets and run against an explicit target ID:

```bash
dist/botprint targets --cdp http://127.0.0.1:9222 --json

dist/botprint run \
  --cdp http://127.0.0.1:9222 \
  --target <targetId> \
  --out site.profile.json \
  --label site
```

Existing-target profiles can reflect page scripts, framework state, service workers, CSP, cookies, storage state, and app state. Botprint marks these profiles with `source.probe_warnings`.

## Docker

When the browser runs outside the host network namespace, the browser may need a host-reachable diagnostic URL:

```bash
dist/botprint run \
  --cdp http://127.0.0.1:9334 \
  --out docker.profile.json \
  --label docker \
  --diagnostic-bind 0.0.0.0 \
  --diagnostic-host host.docker.internal
```

Outside Docker or cross-namespace setups, omit `--diagnostic-bind` and `--diagnostic-host` so the diagnostic page stays bound to `127.0.0.1`.

## Playwright

Expose a CDP port from the browser process you want Botprint to measure:

```ts
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  args: ["--remote-debugging-port=9333"],
});

const page = await browser.newPage();
await page.goto("about:blank");
// Keep the process alive while Botprint connects to http://127.0.0.1:9333.
```

Use the headed/headless mode and browser binary that the environment actually runs.

## Output Contract

Botprint's durable artifacts are JSON profiles and compare JSON.

Stable fields for scripts and agents include:

- `schema_version`
- exit codes
- profile `source.probe_context`
- profile `source.probe_warnings[]`
- finding IDs and severities
- compare diff `id` and `level`
- compare diff `baseline` and `candidate`; missing values are encoded as `{ "kind": "absent" }`
- compare `verdict.level`
- compare `verdict.material`
- compare `verdict.categories`
- compare `verdict.warnings[]`

Markdown reports and `explain --for-agent` output are prose/context, not stable parsing APIs.

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Success, or compare found no material drift. |
| `1` | Compare found material or high-confidence automation drift. |
| `2` | Usage error. |
| `3` | CDP connectivity failure. |
| `4` | Probe failure. |
| `5` | Schema validation failure. |

## Validated So Far

Validated:

- macOS
- local Google Chrome over CDP
- Bun source run
- Bun compiled binary
- source-vs-binary smoke test against local Chrome
- Playwright Chromium over CDP (external consumer)
- Docker Chrome via `chromedp/headless-shell` on Docker Desktop

Not yet validated:

- Linux binary
- remote authenticated `wss://` CDP endpoint

## Privacy

Botprint does not upload profile data. See [`PRIVACY.md`](PRIVACY.md) for what profile artifacts contain and how to handle them.

## Agent Usage

See [`docs/agent-usage.md`](docs/agent-usage.md) for Codex, Claude Code, Cursor, and other coding-agent workflows.

Drop-in agent presets live in [`agent-presets/`](agent-presets) — a Claude Code skill and an `AGENTS.md` snippet for harnesses that follow the AGENTS.md convention.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT. See [`LICENSE`](LICENSE).
