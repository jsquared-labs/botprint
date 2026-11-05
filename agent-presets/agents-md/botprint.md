# Browser Diagnostics (Botprint)

Botprint is a CLI that shows what an automated browser exposes to the web and what changed from a baseline. Use it when a Playwright, Puppeteer, browser-use, or custom CDP flow behaves differently across local, Docker, CI, or remote browsers, or when the user asks what a site sees from their browser. It is a diagnostic tool: report findings as causes to investigate and name the launch option or environment difference responsible. It does not ship spoofing presets or patches.

## Workflow

1. Expose CDP on the browser to measure (`--remote-debugging-port=9222`).
2. Collect a profile per environment. The fresh page runs inside the browser context of the first open page target, so framework context options are measured. `--context default` measures process defaults; `--target <id>` probes an open page in place.

   ```bash
   botprint run --cdp http://127.0.0.1:9222 --out local.profile.json --label local
   ```

3. Compare against a known-good baseline and parse the JSON:

   ```bash
   botprint compare baseline.profile.json candidate.profile.json --json
   botprint explain compare.json --for-agent
   ```

4. Read `verdict.warnings[]` before the diffs. `comparison.headless_mode_mismatch`, `comparison.browser_binary_mismatch`, `comparison.probe_context_mismatch`, and `comparison.browser_context_mismatch` mark diffs that are mode or measurement artifacts rather than drift.
5. Report `verdict.level`, `verdict.categories`, material diffs, and each finding's suggested investigation.

## Contract

Stable: profile and compare JSON, `schema_version`, exit codes (`0` ok or no material drift, `1` material drift, `2` usage, `3` CDP connectivity, `4` probe failure, `5` schema), `findings[].id`/`severity`, diff `id`/`level`/`baseline`/`candidate` (absent is `{ "kind": "absent" }`), `verdict.*`, `source.probe_warnings[]`. Prose: Markdown bodies, `explain` wording, finding and warning text.

Common causes: `automation.webdriver_exposed` is `--enable-automation` (Puppeteer and Playwright default). `identity.headless_user_agent` fires for any Chromium headless mode (the headless shell and `--headless=new` both report HeadlessChrome). `automation.chrome_object_missing`, `environment.zero_outer_window`, and `permissions.notifications_denied` come from the headless shell binary rather than new headless mode. `http.accept_language_missing` means no locale is configured. `rendering.swiftshader_webgl` means no GPU. `rendering.no_common_fonts` means a container without fonts. A `timeout` status means the probe hit `--probe-timeout`; re-run with a larger value.

Redact `--auth-header` values when quoting commands. Keep profiles local unless the user asks to share them. Full reference: `docs/agent-usage.md` in the Botprint repository.
