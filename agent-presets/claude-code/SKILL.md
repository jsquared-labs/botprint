---
name: botprint
description: Use when an automated browser (Playwright, Puppeteer, browser-use, custom CDP) behaves differently across local, Docker, CI, or remote environments, when the user asks what a site sees from their browser, or when interpreting Botprint profile JSON, compare JSON, reports, or explain output.
---

# Botprint Browser Diagnostics

Botprint shows what an automated browser exposes to the web and what changed from a baseline. It is a diagnostic tool: report findings as causes to investigate, and name the launch option or environment difference responsible. Botprint does not ship spoofing presets or patches.

## Setup

```bash
botprint help            # installed binary or `bun install -g botprint`
bunx botprint help       # without installing
```

## Workflow

1. Expose CDP on the browser under investigation (`--remote-debugging-port=9222`). For Playwright, pass it in `args` and keep the process alive.
2. Collect a profile per environment. The fresh page is created inside the browser context of the first open page target, so Playwright/Puppeteer locale, timezone, viewport, and permissions are measured.

   ```bash
   botprint run --cdp http://127.0.0.1:9222 --out /tmp/botprint-candidate.profile.json --label candidate
   ```

   Variants: `--context default` for process defaults; `--target <id>` or `--target-url <prefix>` to probe an open page in place (use `botprint targets --cdp ... --json` to list); Docker browsers need `--diagnostic-bind 0.0.0.0 --diagnostic-host host.docker.internal`; slow CI may need `--probe-timeout 5000`.
3. Compare against a baseline when one exists, and read JSON rather than Markdown:

   ```bash
   botprint compare /tmp/botprint-baseline.profile.json /tmp/botprint-candidate.profile.json --json
   botprint explain /tmp/botprint-compare.json --for-agent
   ```

4. Read `verdict.warnings[]` first. `comparison.headless_mode_mismatch`, `comparison.browser_binary_mismatch`, `comparison.probe_context_mismatch`, and `comparison.browser_context_mismatch` each mean some diffs are measurement or mode artifacts, not environment drift.
5. Report `verdict.level`, `verdict.categories`, the material diffs, and the findings' suggested investigation. Exit code `1` from `compare` means material drift, not a crash.

## Reading Results

Stable: profile and compare JSON, `schema_version`, exit codes, `findings[].id`/`severity`, diff `id`/`level`/`baseline`/`candidate` (absent is `{ "kind": "absent" }`), `verdict.*`, `source.probe_warnings[]`. Prose: Markdown bodies, `explain` wording, finding and warning text.

Common causes behind the findings you will see most:

| Finding | Usual cause |
| --- | --- |
| `automation.webdriver_exposed` | `--enable-automation`, default in Puppeteer and Playwright. |
| `identity.headless_user_agent`, `automation.chrome_object_missing`, `environment.zero_outer_window`, `permissions.notifications_denied` | Headless shell binary (Playwright default `chromium`) instead of new headless (`channel: "chromium"`, `--headless=new`). |
| `http.accept_language_missing` | No locale configured; set Playwright `locale` or Chromium `--lang`. |
| `rendering.swiftshader_webgl` | No GPU in Docker/CI, or `--disable-gpu`. |
| `rendering.no_common_fonts` | Container image without fonts (`fc-list` empty). |
| `environment.default_viewport` | No viewport configured (Chromium default 800x600). |
| `storage.*_unavailable`, `webrtc.host_candidate_error` with `timeout` | Probe hit `--probe-timeout`; re-run with a larger value before treating as drift. |

Redact `--auth-header` values in anything you quote. Keep profiles local unless the user asks to share them.

Full contract, finding table, and warning IDs: `docs/agent-usage.md` in the Botprint repository.
