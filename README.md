# Botprint

Botprint shows what your automated browser exposes to the web, and what changed from your baseline.

It connects to a running Chromium-based browser over the Chrome DevTools Protocol (CDP), runs a probe in a page inside the browser context you are debugging, and writes a schema-versioned JSON profile. Profiles can be rendered as reports, compared against a baseline, and condensed into short explanations for coding agents.

Botprint is a diagnostic tool. It reports what the browser exposes, what differs between two environments, and which launch option or environment difference is most likely responsible. It does not ship spoofing presets or patches.

Typical questions it answers:

- Why does my Playwright or Puppeteer flow behave differently in Docker or CI than on my laptop?
- What does the site actually see from this browser agent: user agent, client hints, Accept-Language, timezone, fonts, GPU, storage, permissions?
- Is this difference real environment drift, or an artifact of how I measured it?

## Install

Release binaries (no runtime needed):

```bash
curl -fsSL https://github.com/oh-meh/botprint/releases/latest/download/botprint-linux-x64 -o botprint
chmod +x botprint && sudo mv botprint /usr/local/bin/
```

Replace `linux-x64` with `linux-arm64`, `darwin-arm64`, `darwin-x64`, or `windows-x64.exe`.

With [Bun](https://bun.sh):

```bash
bunx botprint help          # run without installing
bun install -g botprint     # or install globally
```

From source:

```bash
git clone https://github.com/oh-meh/botprint && cd botprint
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

A profile report looks like this (synthetic Docker example):

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
````

And a compare:

````markdown
# Botprint Compare: synthetic-local -> synthetic-docker

## Summary
- Verdict: material
- Material: yes
- Differences: 28
- Categories: automation, cdp, environment, http, identity, permissions, rendering, storage
- Warnings: comparison.browser_binary_mismatch, comparison.headless_mode_mismatch

## Top Differences
_Showing top 5 of 28 differences. Use `--json` for the full diff list._
- **window.chrome presence changed** (material): signals.automation.chrome_object true -> false
- **Timezone changed** (material): signals.environment.timezone "America/New_York" -> "UTC"
- **WebGL renderer changed** (material): signals.rendering.webgl.unmasked_renderer "ANGLE Metal Renderer: Synthetic GPU" -> "SwiftShader Device (Synthetic)"
- **Detected font set changed** (material): signals.rendering.fonts.detected ["Arial","Courier New","Georgia","Helvetica","Helvetica Neue","Menlo","Monaco","Times New Roman","Verdana"] -> []
- **IndexedDB availability changed** (material): signals.storage.indexed_db "available" -> "error"
````

Full synthetic examples live in [`examples/synthetic`](examples/synthetic).

## What It Measures

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

Findings are generated from these signals with stable IDs. Each finding names the launch option or environment difference that commonly causes it, for example `--enable-automation` for `navigator.webdriver`, or the headless shell binary for a missing `window.chrome`.

## Browser Contexts

Playwright and Puppeteer apply locale, timezone, viewport, permissions, and init scripts per browser context, not per browser. By default `botprint run` creates its fresh diagnostic page inside the browser context of the first open page target, so those options are measured. The profile records which context was used in `source.browser_context_id` and `source.browser_context_source`.

- `--context default` measures the browser's default context instead (process-level defaults only).
- `--context <id>` picks a specific context; IDs are listed by `botprint targets --cdp ... --json`.
- If no page is open, the fresh page falls back to the default context and the profile carries the `default-browser-context` note.
- The diagnostic page is a real page in that context for the length of the probe: Playwright's `context.on("page")` fires, init scripts and route handlers apply to it, and it is closed when the probe ends.

## Existing Pages

To measure an already-open page in place, including its scripts, service workers, CSP, and storage state:

```bash
botprint targets --cdp http://127.0.0.1:9222 --json
botprint run --cdp http://127.0.0.1:9222 --target <targetId> --out site.profile.json
botprint run --cdp http://127.0.0.1:9222 --target-url https://app.example.test/ --out site.profile.json
```

These profiles carry the `page-contamination-possible` note, and HTTP headers are not captured in this mode.

## Docker

When the browser runs in a container, it needs a host-reachable diagnostic URL:

```bash
botprint run --cdp http://127.0.0.1:9334 --out docker.profile.json --label docker \
  --diagnostic-bind 0.0.0.0 --diagnostic-host host.docker.internal
```

Omit both flags otherwise so the diagnostic page stays bound to `127.0.0.1`.

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

Use the headless mode and browser binary that the environment under investigation really runs. Playwright's default `chromium` is the headless shell; `channel: "chromium"` runs new headless mode. Both report `HeadlessChrome` in the user agent; only the shell also drops `window.chrome`, the PDF viewer plugins, and the outer window size.

## Commands

| Command | Purpose |
| --- | --- |
| `run` | Collect a profile from a CDP endpoint. |
| `targets` | List page targets and their browser context IDs. `--json` for scripts. |
| `report` | Render a Markdown report from a profile. |
| `compare` | Compare a baseline profile against a candidate. |
| `explain` | Render a compact explanation of a profile or compare result. |
| `guide` | Guided terminal flow over the same commands. Alias: `tui`. |

`botprint help <command>` lists flags. Notable `run` flags: `--probe-timeout <ms>` (per-check timeout inside the browser, default 2000), `--timeout <ms>` (CDP operations, default 10000), `--auth-header` (repeatable, for remote endpoints).

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Success, or compare found no material drift. |
| `1` | Compare found material or high-confidence automation drift. |
| `2` | Usage error. |
| `3` | CDP connectivity failure. |
| `4` | Probe failure. |
| `5` | Schema validation failure. |

## Output Contract

Profile JSON and compare JSON are the stable surfaces for scripts and agents. Markdown and `explain` output are prose. Profiles from an older `schema_version` fail validation with a hint to regenerate, so re-collect baselines with the Botprint version that compares them. The contract, finding IDs, warning IDs, and category glossary are documented in [`docs/agent-usage.md`](docs/agent-usage.md). Drop-in agent presets (a Claude Code skill and an `AGENTS.md` snippet) live in [`agent-presets/`](agent-presets).

## Validated On

- Linux x64: Chromium headless, Playwright Chromium headless shell (source run and compiled binary)
- macOS arm64: Google Chrome new headless (source run and compiled binary); headed Chrome, Playwright Chromium, and Docker Chrome via `chromedp/headless-shell` last checked on v0.1

Not yet validated: Windows binary, remote authenticated `wss://` CDP endpoints.

## Privacy

Botprint does not upload anything. Profiles stay on disk. See [`PRIVACY.md`](PRIVACY.md) for what they contain.

## Contributing and License

See [`CONTRIBUTING.md`](CONTRIBUTING.md). MIT, see [`LICENSE`](LICENSE).
