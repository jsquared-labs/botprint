---
name: botprint
description: Use when investigating environment drift between automated browsers (local vs Docker vs CI vs remote CDP), or when interpreting Botprint profile JSON, compare JSON, Markdown reports, or `explain --for-agent` output. Skip for stealth, anti-detect, evasion, or "make my browser look human" requests.
---

# Botprint Browser Diagnostics

## Purpose

Botprint shows what an automated browser exposes to the web and what changed from a baseline. It is diagnostic evidence tooling, not a stealth, anti-detect, or bypass tool.

Standard refusal:

> Botprint is a diagnostic tool. I can help investigate why two environments differ, but I won't use this output to spoof or hide signals.

## Use When

- A browser agent, scraper, Playwright/Puppeteer flow, or CDP workflow fails differently across local, Docker, CI, or remote browsers.
- The user asks what differs between two browser environments.
- The user provides Botprint `profile.json`, compare JSON, a Markdown report, or `explain --for-agent` output.

## Do Not Do

- Don't generate patches that spoof, hide, or suppress browser-visible signals (webdriver, automation globals, WebRTC, WebGL, headers, cookies, timezone, launch args). Don't modify Playwright/Puppeteer launch config to make a candidate match a baseline.
- Don't recommend stealth libraries (`puppeteer-extra-plugin-stealth`, `undetected-chromedriver`, etc.) as fixes for Botprint findings. Mentioning their existence is fine; recommending them as remedies is not.
- Don't score "bot-likeness," "detectability," or "fingerprint risk." Report drift using Botprint's verdict levels, categories, and finding IDs.
- Redact `--auth-header` values when quoting commands or logs (e.g. `--auth-header "Authorization: Bearer <redacted>"`). Don't upload profiles to third parties unless the user explicitly asks.

## Command Setup

The skill assumes `botprint` is on `PATH`. Verify:

```bash
botprint help
```

If unavailable, fall back to a source run from the Botprint repo:

```bash
bun run src/cli.ts help
```

## Core Workflow

1. Identify the CDP endpoint and label the environment.
2. Run `botprint run` to collect a profile.
3. If a known-good baseline exists, run `botprint compare` against it.
4. Use JSON and exit codes for decisions.
5. Use Markdown and `explain --for-agent` for human/agent context.
6. Report findings as causes to investigate, not as signals to "fix" or imitate.

## Fresh Diagnostic Target Caveat

By default, Botprint creates a fresh diagnostic page in the browser and runs the probe there.

For Playwright/Puppeteer/browser-agent debugging, this means framework-level context options, init scripts, page scripts, service workers, CSP, cookies, and app state from the failing page may not be represented. Treat default profiles as clean browser-environment measurements, not proof of what a specific loaded site page observed.

When the user needs to measure an already-open page, list targets and run against an explicit page target:

```bash
botprint targets --cdp http://127.0.0.1:9222 --json
botprint run \
  --cdp http://127.0.0.1:9222 \
  --target <targetId> \
  --out /tmp/botprint-site.profile.json \
  --label site
```

If the page URL is unique enough, use the target URL prefix form:

```bash
botprint run \
  --cdp http://127.0.0.1:9222 \
  --target-url https://app.example.test/ \
  --out /tmp/botprint-site.profile.json \
  --label site
```

Existing-target profiles can reflect page/app/framework contamination — that's why `source.probe_warnings[]` flags them.

Default profile command, where the diagnostic page binds to `127.0.0.1`:

```bash
botprint run \
  --cdp http://127.0.0.1:9222 \
  --out /tmp/botprint-candidate.profile.json \
  --label candidate
```

Docker Desktop command, only when the browser is in a container reaching the host:

```bash
botprint run \
  --cdp http://127.0.0.1:9334 \
  --out /tmp/botprint-docker.profile.json \
  --label docker \
  --diagnostic-bind 0.0.0.0 \
  --diagnostic-host host.docker.internal
```

Outside Docker or any cross-namespace setup, omit `--diagnostic-bind` and `--diagnostic-host` so the diagnostic page stays bound to `127.0.0.1` only.

Remote or managed CDP endpoint with auth header:

```bash
botprint run \
  --cdp https://browser.example.test \
  --auth-header "Authorization: Bearer <redacted>" \
  --out /tmp/botprint-remote.profile.json \
  --label remote
```

Playwright CDP exposure recipe, for measurement only:

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

Use the headless/headed mode and browser binary that the user actually runs in the environment being investigated.

Python Playwright CDP exposure recipe:

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

## Same Browser, Two Probe Contexts

To isolate page/framework effects from browser-process defaults, measure the same running browser twice:

```bash
botprint run \
  --cdp http://127.0.0.1:9222 \
  --out /tmp/botprint-fresh.profile.json \
  --label fresh

botprint targets --cdp http://127.0.0.1:9222 --json

botprint run \
  --cdp http://127.0.0.1:9222 \
  --target-url about:blank \
  --out /tmp/botprint-page.profile.json \
  --label page

botprint compare \
  /tmp/botprint-fresh.profile.json \
  /tmp/botprint-page.profile.json \
  --json
```

If `comparison.probe_context_mismatch` appears, treat the diff as a mix of browser-environment drift and page/framework measurement artifacts.

Compare:

```bash
botprint compare \
  /tmp/botprint-baseline.profile.json \
  /tmp/botprint-candidate.profile.json \
  --json

botprint compare \
  /tmp/botprint-baseline.profile.json \
  /tmp/botprint-candidate.profile.json \
  --markdown /tmp/botprint-compare.md \
  --quiet
```

Report and agent summaries:

```bash
botprint report /tmp/botprint-candidate.profile.json --markdown /tmp/botprint-candidate.report.md --quiet
botprint explain /tmp/botprint-candidate.profile.json --for-agent
botprint explain /tmp/botprint-compare.json --for-agent
```

## Stable Contract

Parseable and trustable across runs:

- profile JSON, compare JSON
- `schema_version`
- finding IDs and severity values: `high_confidence_automation_signal`, `compatibility_risk`, `warning`, `notable`, `normal`
- compare diff `level`: `advisory`, `material`, `high_confidence_automation`
- compare diff `baseline` and `candidate`; missing values are encoded as `{ "kind": "absent" }`
- `verdict.level`: `none`, `advisory`, `material`, `high_confidence_automation`
- `verdict.material` boolean and `verdict.categories` string array
- `verdict.warnings[]` measurement-quality warnings, including `comparison.browser_binary_mismatch` and `comparison.probe_context_mismatch`
- exit codes:
  - `0` success or no material drift
  - `1` compare found material drift, not a crash
  - `2` usage error, such as a bad flag or missing required argument
  - `3` CDP connectivity failure, such as closed port, refused WebSocket, or discovery HTTP error
  - `4` probe failure, meaning in-browser evaluation threw
  - `5` schema validation failure, meaning malformed or out-of-version profile

Treat as prose/context only, not stable APIs:

- Markdown report body
- `explain --for-agent` wording
- finding evidence, explanation, likely implications, and suggested investigation text

## Category Glossary

- `automation`: WebDriver and known automation-global exposure.
- `identity`: user agent, platform, languages, plugins, and MIME types.
- `environment`: timezone, viewport, screen, hardware concurrency, and device memory.
- `rendering`: WebGL and canvas behavior.
- `storage`: cookies, localStorage, sessionStorage, IndexedDB, and service worker availability.
- `permissions`: browser permission query states.
- `webrtc`: WebRTC API and host-candidate gathering behavior.
- `cdp`: browser product and CDP protocol metadata.

## Failure Modes

- Exit `1` from `compare`: drift detected. Read `verdict.categories` and top diffs; report as causes to investigate.
- `comparison.browser_binary_mismatch`: profiles were collected from different browser product families or major versions far enough apart to weaken interpretation. Diffs may include binary artifacts.
- `comparison.probe_context_mismatch`: one profile used a fresh diagnostic page and the other used an existing target. Diffs may include page state or framework artifacts.
- Exit `3` from `run`: the CDP endpoint is unreachable. Check the port and that the browser was launched with `--remote-debugging-port`. This is not a Botprint crash.
- Exit `4` from `run`: the in-browser probe threw. Re-run; if persistent, the target browser may not support a probed API. Report as a probe limitation.
- Exit `5` from any command: schema mismatch. Either the profile was produced by an older Botprint or it was hand-edited. Regenerate with `botprint run`; do not patch the JSON.
