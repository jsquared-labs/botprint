# Botprint

[![CI](https://github.com/jsquared-labs/botprint/actions/workflows/ci.yml/badge.svg)](https://github.com/jsquared-labs/botprint/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/botprint)](https://www.npmjs.com/package/botprint)
[![Release](https://img.shields.io/github/v/release/jsquared-labs/botprint)](https://github.com/jsquared-labs/botprint/releases/latest)
[![License: MIT](https://img.shields.io/github/license/jsquared-labs/botprint)](LICENSE)

Botprint shows what your automated browser exposes to the web, and what changed from your baseline.

Point it at a running Chromium-based browser over the Chrome DevTools Protocol (CDP). It opens a page in the browser context you're debugging, records what that page can see, and saves the result as a JSON profile. You can then turn a profile into a report, compare it with a baseline, or condense it into a short explanation for a coding agent. Each finding names the launch option or environment difference that most likely caused it. Botprint does not ship spoofing presets or patches.

It's built for questions like these:

- Why does my Playwright or Puppeteer flow behave differently in Docker or CI than on my laptop?
- What does a site see from this browser: user agent, client hints, Accept-Language, timezone, fonts, GPU, storage, permissions?
- Is this difference real drift between environments, or did I measure the two differently?

Botprint sees what page JavaScript and request headers reveal. It can't see the network layer (TLS and HTTP/2 fingerprints, IP address) or anything about how the browser is driven, such as mouse movement or timing. Firefox and WebKit aren't supported.

## Install

Release binaries need no runtime:

```bash
curl -fsSL https://github.com/jsquared-labs/botprint/releases/latest/download/botprint-linux-x64 -o botprint
chmod +x botprint && sudo mv botprint /usr/local/bin/
```

Replace `linux-x64` with `linux-arm64`, `darwin-arm64`, or `darwin-x64`. On Windows, download `botprint-windows-x64.exe` from the [latest release](https://github.com/jsquared-labs/botprint/releases/latest).

The npm package needs [Bun](https://bun.sh); `npx botprint` under Node won't work.

```bash
bunx botprint help          # run without installing
bun install -g botprint     # or install globally
```

From source:

```bash
git clone https://github.com/jsquared-labs/botprint && cd botprint
bun install && bun run build   # writes dist/botprint
```

## Quickstart

Start the browser with a CDP port and collect a profile:

```bash
botprint run --cdp http://127.0.0.1:9222 --out local.profile.json --label local
```

Compare two environments:

```bash
botprint compare local.profile.json docker.profile.json          # Markdown summary
botprint compare local.profile.json docker.profile.json --json   # full diff list
```

Render a report or a compact explanation:

```bash
botprint report docker.profile.json
botprint explain docker.profile.json --for-agent
```

Here's part of a report for a synthetic Docker profile. Each finding comes with a suggestion for where to look:

````markdown
# Botprint Profile: synthetic-docker

## Key Signals
- WebDriver: false; window.chrome: false
- WebGL: SwiftShader Device (Synthetic)
- Canvas: stable; audio: available
- Fonts: 0 of 31 common fonts detected
- Storage: cookies=true, indexedDB=error
- Accept-Language: (not sent)

## Top Findings
_Showing top 5 of 9 findings. Use `--json` for the full finding list._
- **IndexedDB is unavailable** (compatibility_risk): IndexedDB status is error.
- **Browser identifies itself as headless** (warning): User agent reports HeadlessChrome/145. Client hint brands include HeadlessChrome.
- **Software WebGL renderer detected** (warning): Renderer evidence: WebKit WebGL SwiftShader Device (Synthetic).
- **No common fonts detected** (warning): None of 31 common fonts rendered differently from the generic fallback families.
- **No Accept-Language header is sent** (warning): The browser's request for the diagnostic page carried no Accept-Language header.

## Suggested Investigation
- Software rendering is normal in headless, Docker, and CI without a GPU, and is forced by --disable-gpu. Check the launch flags and whether a GPU is available in the candidate environment.
- Check the container or CI image for installed fonts (for example `fc-list`). Minimal Docker images frequently ship none.
- Set a locale on the context (Playwright `locale`, Puppeteer `--lang`/`--accept-lang`) or in the container environment, matching the baseline.
````

And part of a compare. The two profiles came from different browser builds (headed Chrome 147 and the headless shell of 145), and Botprint says so before listing differences, because some of them, such as `window.chrome`, come from the build rather than the environment:

````markdown
# Botprint Compare: synthetic-local -> synthetic-docker

## Summary
- Verdict: material
- Material: yes
- Differences: 28
- Categories: automation, cdp, environment, http, identity, permissions, rendering, storage
- Warnings: comparison.browser_binary_mismatch, comparison.headless_mode_mismatch

## Warnings
- **comparison.browser_binary_mismatch**: Baseline and candidate were collected from different browser binaries. Diffs below may include artifacts of the binary difference, not environment drift alone. (baseline_product="Chrome/147.0.0.0", candidate_product="HeadlessChrome/145.0.0.0")
- **comparison.headless_mode_mismatch**: One profile came from the headless shell binary and the other from a headed or new-headless build. Plugin counts, window.chrome, outer window size, and notification permission change with the headless shell; the user agent changes only against a headed build. Treat those diffs as mode differences unless the environments are meant to match. (baseline_product="Chrome/147.0.0.0", candidate_product="HeadlessChrome/145.0.0.0", baseline_user_agent="Mozilla/5.0 (Synthetic) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36", candidate_user_agent="Mozilla/5.0 (Synthetic) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/145.0.0.0 Safari/537.36")

## Top Differences
_Showing top 5 of 28 differences. Use `--json` for the full diff list._
- **window.chrome presence changed** (material): signals.automation.chrome_object true -> false
- **Timezone changed** (material): signals.environment.timezone "America/New_York" -> "UTC"
- **WebGL renderer changed** (material): signals.rendering.webgl.unmasked_renderer "ANGLE Metal Renderer: Synthetic GPU" -> "SwiftShader Device (Synthetic)"
- **Detected font set changed** (material): signals.rendering.fonts.detected ["Arial","Courier New","Georgia","Helvetica","Helvetica Neue","Menlo","Monaco","Times New Roman","Verdana"] -> []
- **IndexedDB availability changed** (material): signals.storage.indexed_db "available" -> "error"
````

The full examples are in [`examples/synthetic`](examples/synthetic).

## What it measures

| Category | Signals |
| --- | --- |
| `identity` | user agent, client hint brands/platform/mobile, platform, language and languages, plugin and MIME counts, PDF viewer |
| `automation` | `navigator.webdriver`, `window.chrome` presence, known automation globals |
| `environment` | timezone, viewport, outer window size, screen metrics and color depth, hardware concurrency, device memory, speech voice count |
| `rendering` | WebGL vendor/renderer (masked and unmasked), canvas hash, audio hash, detected common fonts |
| `storage` | cookies, localStorage, sessionStorage, IndexedDB, service worker |
| `permissions` | Permissions API states and `Notification.permission` |
| `webrtc` | API availability and local host-candidate gathering (no STUN) |
| `http` | request headers the browser sent for the diagnostic page: User-Agent, Accept-Language, Sec-CH-UA client hints, Sec-Fetch, Accept-Encoding |
| `cdp` | browser product and protocol version |

Botprint turns these signals into findings, each with a stable ID. A finding names the launch option or environment difference that usually causes it: `--enable-automation` for `navigator.webdriver`, for example, or the headless shell binary for a missing `window.chrome`.

## Browser contexts

Playwright sets locale, timezone, viewport, permissions, and init scripts on a browser context, not on the whole browser. So by default `botprint run` opens its page in the same context as the first open page, and those settings show up in the profile. The profile records which context it used in `source.browser_context_id` and `source.browser_context_source`.

Puppeteer sets most of these on each page instead (`setUserAgent`, `emulateTimezone`, `setViewport`, `evaluateOnNewDocument`). A new page doesn't inherit them, so measure the existing page in place; see [Puppeteer](#puppeteer).

- `--context default` measures the browser's default context instead, which only has process-level defaults.
- `--context <id>` picks a specific context. `botprint targets --cdp ... --json` lists the IDs.
- If no page is open, Botprint falls back to the default context and adds the `default-browser-context` note to the profile.
- While the probe runs, Botprint's page is a real page in that context: Playwright's `context.on("page")` fires, and init scripts and route handlers apply to it. Botprint closes it when the probe ends.

## Existing pages

To measure a page that's already open, with its own scripts, service workers, CSP, and storage:

```bash
botprint targets --cdp http://127.0.0.1:9222 --json
botprint run --cdp http://127.0.0.1:9222 --target <targetId> --out site.profile.json
botprint run --cdp http://127.0.0.1:9222 --target-url https://app.example.test/ --out site.profile.json
```

These profiles carry the `page-contamination-possible` note, because the page's scripts, service workers, and app state can change what Botprint sees. HTTP headers aren't captured in this mode.

## Docker

When the browser runs in a container, it has to be able to reach Botprint's diagnostic page on the host:

```bash
botprint run --cdp http://127.0.0.1:9334 --out docker.profile.json --label docker \
  --diagnostic-bind 0.0.0.0 --diagnostic-host host.docker.internal
```

Docker Desktop resolves `host.docker.internal` for you. On Docker Engine for Linux, start the browser container with `--add-host=host.docker.internal:host-gateway`.

Leave both flags out when the browser runs on the same machine, so the diagnostic page stays bound to `127.0.0.1`.

## Playwright

Expose CDP from the browser you want to measure:

```ts
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, args: ["--remote-debugging-port=9333"] });
const page = await browser.newPage();
await page.goto("about:blank");
// Keep the process alive while Botprint connects to http://127.0.0.1:9333.
```

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--remote-debugging-port=9333"])
    page = browser.new_context().new_page()
    page.goto("about:blank")
    input("Botprint can attach to http://127.0.0.1:9333. Press Enter to quit.")
```

Measure the same headless mode and browser binary that the environment you're debugging runs. Playwright's default `chromium` is the headless shell, and `channel: "chromium"` runs new headless mode. Both put `HeadlessChrome` in the user agent. Only the shell also drops `window.chrome`, the PDF viewer plugins, and the outer window size.

## Puppeteer

Botprint accepts the WebSocket endpoint Puppeteer gives you. Because Puppeteer's emulation lives on the page, point Botprint at your page with `--target-url`:

```ts
import puppeteer from "puppeteer";

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.emulateTimezone("Asia/Tokyo");
await page.goto("https://app.example.test/");
console.log(browser.wsEndpoint());
// Keep the process alive, then run:
// botprint run --cdp <ws endpoint> --target-url https://app.example.test/ --out site.profile.json
```

Without `--target-url`, Botprint opens a new page, which reports the browser's own timezone and user agent rather than the ones you set.

## Commands

| Command | Purpose |
| --- | --- |
| `run` | Collect a profile from a CDP endpoint. |
| `targets` | List page targets and their browser context IDs. `--json` for scripts. |
| `report` | Render a Markdown report from a profile. |
| `compare` | Compare a baseline profile against a candidate. |
| `explain` | Render a compact explanation of a profile or compare result. |
| `guide` | Guided terminal flow over the same commands. Alias: `tui`. |

`botprint help <command>` lists every flag. The `run` flags you're most likely to need: `--probe-timeout <ms>` (how long each check inside the browser may take, default 2000), `--timeout <ms>` (CDP operations, default 10000), and `--auth-header` (repeatable, for remote endpoints).

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success, or compare found no material drift. |
| `1` | Compare found material or high-confidence automation drift. |
| `2` | Usage error. |
| `3` | CDP connectivity failure. |
| `4` | Probe failure. |
| `5` | Schema validation failure. |

## Using the output in scripts and agents

Build scripts and agents on the profile and compare JSON. Their fields are versioned and stay stable. The Markdown and `explain` output are written for people and may change between versions. A profile from an older `schema_version` fails validation with a hint to regenerate it, so when an upgrade changes the schema, collect your baselines again. [`docs/agent-usage.md`](docs/agent-usage.md) lists the JSON fields, finding IDs, warning IDs, and categories. [`agent-presets/`](agent-presets) has a ready-made Claude Code skill and an `AGENTS.md` snippet.

## Tested on

- Linux x64: Chromium headless, Playwright Chromium headless shell (source run and compiled binary)
- macOS arm64: Google Chrome new headless (source run and compiled binary); headed Chrome, Playwright Chromium, and Docker Chrome via `chromedp/headless-shell` last checked on v0.1

Not tested yet: the Linux arm64, macOS x64, and Windows binaries (the release workflow builds them, but nobody has run them), and remote authenticated `wss://` CDP endpoints.

## Privacy

Botprint doesn't upload anything. Profiles stay on your disk. [`PRIVACY.md`](PRIVACY.md) describes what they contain.

## Contributing and license

See [`CONTRIBUTING.md`](CONTRIBUTING.md). MIT licensed; see [`LICENSE`](LICENSE).
