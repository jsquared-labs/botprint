# Agent Usage

This is the reference for coding agents (Claude Code, Codex, Cursor, browser-use, and similar) that run Botprint or interpret its output. The README covers installation and human workflows.

Botprint is a diagnostic tool: it reports what a browser exposes, what differs from a baseline, and which launch option or environment difference is likely responsible. Report findings as causes to investigate. Botprint does not ship spoofing presets or patches.

## When To Use

- A Playwright, Puppeteer, browser-use, Stagehand, or raw CDP flow behaves differently across local, Docker, CI, or remote browsers.
- The user wants to know what a site sees from a given browser: identity, headers, locale, fonts, GPU, storage, permissions.
- The user provides a Botprint profile, compare JSON, report, or `explain` output.

## Workflow

1. Expose CDP on the browser under investigation (`--remote-debugging-port=9222`).
2. Collect a profile per environment with `botprint run`. The fresh page is created inside the browser context of the first open page target, so framework context options are measured. Pass `--context default` to measure process defaults, or `--target`/`--target-url` to probe an open page in place.
3. If a known-good baseline exists, `botprint compare baseline.json candidate.json --json`.
4. Decide from JSON and exit codes. Use `report` and `explain --for-agent` as prose context.
5. Read `verdict.warnings[]` before interpreting diffs: they say when a difference is a measurement artifact rather than drift.

```bash
botprint run --cdp http://127.0.0.1:9222 --out local.profile.json --label local
botprint targets --cdp http://127.0.0.1:9222 --json
botprint run --cdp http://127.0.0.1:9222 --target-url https://app.example.test/ --out site.profile.json --label site
botprint compare local.profile.json docker.profile.json --json
botprint explain compare.json --for-agent
```

Docker browsers need `--diagnostic-bind 0.0.0.0 --diagnostic-host host.docker.internal`. Remote endpoints take `--auth-header "Authorization: Bearer <redacted>"` (repeatable). Redact header values whenever you quote a command.

## Stable Contract

Parse and rely on:

- profile JSON and compare JSON, keyed by `schema_version` (currently `0.3`)
- exit codes
- profile `source.probe_context`, `source.browser_context_id`, `source.browser_context_source`, `source.probe_warnings[]`, `source.target_id`, `source.target_type`
- profile `findings[]`: `id`, `severity`, `category`
- compare diff `id`, `level`, `category`, `path`, `baseline`, `candidate`; absent values are `{ "kind": "absent" }`
- compare `verdict.level`, `verdict.material`, `verdict.categories[]`, `verdict.warnings[].id`, `verdict.warnings[].evidence`

Treat as prose only: Markdown report bodies, `explain` wording, finding `title`/`evidence`/`explanation`/`likely_implications`/`suggested_investigation`, and warning `summary`/`implications`.

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Success, or compare found no material drift. |
| `1` | Compare found material or high-confidence automation drift. Not a crash. |
| `2` | Usage error. |
| `3` | CDP connectivity failure. Check the endpoint and `--remote-debugging-port`. |
| `4` | Probe failure. The in-browser probe threw; the message includes the exception. |
| `5` | Schema validation failure. Regenerate the profile; do not hand-edit JSON. |

## Findings

Severity values: `high_confidence_automation_signal`, `compatibility_risk`, `warning`, `notable`, `normal`.

| ID | Severity | Common cause |
| --- | --- | --- |
| `automation.webdriver_exposed` | high confidence | `--enable-automation`, passed by default by Puppeteer and Playwright, always by Selenium. |
| `automation.common_globals_present` | high confidence | ChromeDriver (`cdc_*`), legacy headless stacks. |
| `automation.chrome_object_missing` | notable | Headless shell binary (Playwright's default `chromium`) rather than new headless mode. |
| `identity.headless_user_agent` | warning | Any Chromium headless mode; the headless shell and `--headless=new` both report `HeadlessChrome`. Only a headed browser reports `Chrome`. |
| `identity.empty_plugins` | notable | The headless shell exposes no PDF viewer plugins; headed and new headless expose a fixed set. |
| `environment.default_viewport` | notable | No viewport configured; Chromium default is 800x600. |
| `environment.zero_outer_window` | notable | Headless shell reports no window. |
| `rendering.swiftshader_webgl` | warning | No GPU, Docker, CI, or `--disable-gpu`. |
| `rendering.webgl_unavailable` | compatibility risk | GPU disabled or unsupported flags. |
| `rendering.unmasked_webgl_unavailable` | notable | Browser withholds `WEBGL_debug_renderer_info`. |
| `rendering.canvas_unstable` | notable / compatibility risk | Canvas output varied between two draws. |
| `rendering.no_common_fonts` | warning | Minimal container image with no fonts installed (`fc-list` is empty). |
| `storage.cookies_disabled` | compatibility risk | Cookies disabled by policy or context option. |
| `storage.indexeddb_unavailable` | compatibility risk / notable | Storage policy or restricted origin; `timeout` means the probe hit `--probe-timeout`. |
| `permissions.unexpected_permissions_behavior` | notable | Permissions API query errored. |
| `permissions.notifications_denied` | notable | The headless shell reports `Notification.permission` as denied; headed and new headless report prompt. |
| `webrtc.host_candidate_error` | notable | WebRTC blocked by policy or sandboxing; `timeout` means the probe hit `--probe-timeout`. |
| `http.accept_language_missing` | warning | No locale configured (headless shell, minimal containers). Set Playwright `locale` or `--lang`. |

## Compare Levels and Warnings

Diff `level` and `verdict.level`: `advisory`, `material`, `high_confidence_automation` (`verdict.level` can also be `none`). Loss of a storage capability, timezone, WebGL renderer, `window.chrome`, Accept-Language, and lost fonts are material; most other drift is advisory. User agent diffs ignore build-number noise and fire only on family, major version, or platform changes.

Warnings never change the verdict or exit code. They tell you how much to trust the diffs:

- `comparison.browser_binary_mismatch`: different binary families or majors two or more apart. Diffs may be binary artifacts.
- `comparison.headless_mode_mismatch`: one profile is headless and the other is not, judged from the CDP product and the user agent. When the headless shell is involved, plugins, `window.chrome`, outer window, and notifications change too; with new headless mode only the user agent does.
- `comparison.probe_context_mismatch`: one profile is a fresh page, the other an existing target.
- `comparison.browser_context_mismatch`: one profile measured a page-target context and the other the browser default context. Locale, timezone, viewport, and permission diffs may be context configuration.
- `comparison.http_not_captured`: headers exist on only one side; header diffs are skipped.

Profile `source.probe_warnings[]`:

- `page-contamination-possible`: existing-target profile; page scripts, service workers, CSP, cookies, and app state may affect signals.
- `default-browser-context`: no page target was open, so the fresh page used the browser default context.
- `multiple-browser-contexts`: page targets span several contexts; the first was used. Pass `--context <id>` to choose.
- `http-not-captured`: the diagnostic page request was not observed.

## Category Glossary

- `automation`: WebDriver, `window.chrome`, known automation globals.
- `identity`: user agent, client hints, platform, language(s), plugins, MIME types, PDF viewer.
- `environment`: timezone, viewport, outer window, screen, hardware concurrency, device memory, speech voices.
- `rendering`: WebGL, canvas, audio, fonts.
- `storage`: cookies, localStorage, sessionStorage, IndexedDB, service worker.
- `permissions`: Permissions API states and `Notification.permission` (`notification_api`).
- `webrtc`: WebRTC API and host-candidate gathering.
- `http`: request headers sent for the diagnostic page (fresh-page mode only).
- `cdp`: browser product and protocol metadata.
