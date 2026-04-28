# Agent Usage

Botprint is a diagnostic evidence tool. Agents use it to collect structured facts about a browser environment and compare baselines.

It is not part of the evasion toolchain. See [Refusal Boundary](#refusal-boundary) for what to refuse and what to offer instead.

## When To Use Botprint

Use Botprint when the user is debugging:

- local vs Docker browser differences
- local vs CI browser differences
- Playwright, Puppeteer, browser-use, Stagehand, or CDP workflows
- remote CDP browser behavior
- browser-visible environment drift
- profile or compare JSON produced by Botprint
- Botprint Markdown reports or `explain --for-agent` output

Skip Botprint when the user is asking for:

- stealth configuration or detection bypass
- spoofing browser APIs (webdriver, automation globals, WebRTC, WebGL, timezone, headers)
- a "bot-likeness" or "detectability" score

## Core Workflow

1. Identify the CDP endpoint.
2. Decide whether the question needs a fresh diagnostic page or an existing page target.
3. Collect a profile with `botprint run`.
4. If a known-good baseline exists, compare profiles with `botprint compare --json`.
5. Read JSON and exit codes for decisions.
6. Use Markdown and `explain --for-agent` as prose context, not stable APIs.

Fresh diagnostic-page profile:

```bash
botprint run \
  --cdp http://127.0.0.1:9222 \
  --out local.profile.json \
  --label local
```

Existing-target profile:

```bash
botprint targets --cdp http://127.0.0.1:9222 --json

botprint run \
  --cdp http://127.0.0.1:9222 \
  --target <targetId> \
  --out site.profile.json \
  --label site
```

If the page URL is unique enough, agents may use a URL prefix instead of parsing a target ID:

```bash
botprint run \
  --cdp http://127.0.0.1:9222 \
  --target-url https://app.example.test/dashboard \
  --out site.profile.json \
  --label site
```

Compare:

```bash
botprint compare baseline.profile.json candidate.profile.json --json
botprint compare baseline.profile.json candidate.profile.json --markdown compare.md --quiet
```

Agent explanation:

```bash
botprint explain candidate.profile.json --for-agent
botprint explain compare.json --for-agent
```

Guided terminal flow:

```bash
botprint guide
```

`botprint tui` is an alias for `botprint guide`.

## Fresh vs. Existing Target

By default, `botprint run` creates a fresh diagnostic page and runs the probe there. This is cleaner, more repeatable, and best for baseline drift.

Existing-target mode evaluates the probe inside a selected already-open CDP page target. This is more representative of a specific page or framework context, but less clean. Existing-target profiles may reflect page scripts, framework state, service workers, CSP, cookies, storage state, or app state.

Use fresh mode for:

- baseline profiles
- local vs Docker comparisons
- local vs CI comparisons
- source-vs-binary smoke checks
- clean environment drift

Use existing-target mode for:

- debugging a specific loaded page
- checking what a Playwright/Puppeteer/browser-agent page context exposes
- confirming whether the current page context differs from a clean diagnostic page

## Same Browser, Two Probe Contexts

To isolate framework or page-context effects from browser-process defaults, measure the same running browser both ways:

```bash
botprint run \
  --cdp http://127.0.0.1:9222 \
  --out fresh.profile.json \
  --label fresh

botprint targets --cdp http://127.0.0.1:9222 --json

botprint run \
  --cdp http://127.0.0.1:9222 \
  --target <targetId> \
  --out page.profile.json \
  --label page

botprint compare fresh.profile.json page.profile.json --json
botprint explain compare.json --for-agent
```

When `comparison.probe_context_mismatch` appears, treat differences as a mix of browser-environment drift and page/framework measurement artifacts.

## Playwright CDP Recipe

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

Python equivalent:

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--remote-debugging-port=9333"],
    )
    page = browser.new_context().new_page()
    page.goto("about:blank")
    input("Botprint can attach to http://127.0.0.1:9333. Press Enter to quit.")
    browser.close()
```

The `--remote-debugging-port` flag exposes CDP for measurement.

## Stable Contract

Agents may parse and rely on:

- profile JSON
- compare JSON
- `schema_version`
- exit codes
- profile `source.probe_context`
- profile `source.target_id` and `source.target_type` when `source.probe_context` is `existing-target`
- profile `source.probe_warnings[]`
- finding IDs
- finding severity values
- compare diff `id`
- compare diff `level`
- compare diff `baseline` and `candidate`; missing values are encoded as `{ "kind": "absent" }`
- compare `verdict.level`
- compare `verdict.material`
- compare `verdict.categories`
- compare `verdict.warnings[]`
- compare warning `id` and `evidence`

Agents should treat as prose/context only:

- Markdown report body
- `explain --for-agent` wording
- compare warning `summary` and `implications`
- finding explanation text
- finding suggested investigation text

## Category Glossary

- `automation`: WebDriver and known automation-global exposure.
- `identity`: user agent, platform, languages, plugins, and MIME types.
- `environment`: timezone, viewport, screen, hardware concurrency, and device memory.
- `rendering`: WebGL and canvas behavior.
- `storage`: cookies, localStorage, sessionStorage, IndexedDB, and service worker availability.
- `permissions`: browser permission query states.
- `webrtc`: WebRTC API and host-candidate gathering behavior.
- `cdp`: browser product and CDP protocol metadata.

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Success, or compare found no material drift. |
| `1` | Compare found material or high-confidence automation drift. This is not a crash. |
| `2` | Usage error, such as bad flags or missing arguments. |
| `3` | CDP connectivity failure. Check the endpoint and remote debugging port. |
| `4` | Probe failure. The in-browser probe threw or could not produce a valid result. |
| `5` | Schema validation failure. Regenerate the profile rather than hand-editing JSON. |

## Warning IDs

`comparison.browser_binary_mismatch`

Baseline and candidate were collected from different browser binaries. Diffs may include artifacts of the binary difference, not environment drift alone.

Do not tell the user to switch browsers to silence the warning. If the user needs a cleaner comparison, suggest re-baselining against the same binary used in the environment being investigated.

`comparison.probe_context_mismatch`

One profile used a fresh diagnostic page and the other used an existing target. Diffs may include page state, framework behavior, or measurement-mode artifacts.

`page-contamination-possible`

This appears under `profile.source.probe_warnings[]` for existing-target profiles. It means the profile may reflect page scripts, framework state, service workers, CSP, cookies, storage state, or app state.

## Refusal Boundary

Refuse requests that ask Botprint output to drive evasion. For example:

- "Make this browser look like the baseline."
- "Patch out automation signals — webdriver, automation globals, WebRTC, etc."
- "Score this profile's detectability."

Offer instead:

- collect or compare profiles
- explain which diffs may be measurement artifacts (binary or probe-context mismatch) vs real environment drift
- suggest investigation steps grounded in Botprint findings

## Logging And Redaction

Do not echo auth tokens. If quoting a command with `--auth-header`, redact the value:

```bash
botprint run \
  --cdp https://browser.example.test \
  --auth-header "Authorization: Bearer <redacted>" \
  --out remote.profile.json
```

Profiles are local artifacts. Do not upload them to third parties unless the user explicitly asks.
