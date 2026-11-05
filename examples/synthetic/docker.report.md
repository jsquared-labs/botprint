# Botprint Profile: synthetic-docker

## Summary
- Browser: HeadlessChrome/145.0.0.0
- Target: http://host.docker.internal:45002/
- Findings: 9

## Browser Context
- Probe context: fresh page in the browser context of an existing page target
- User agent: Mozilla/5.0 (Synthetic) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/145.0.0.0 Safari/537.36
- Platform: SyntheticPlatform
- Language: en-US; languages=["en-US","en"]
- Timezone: UTC
- Viewport: 1280x720 @ 1; outer 0x0

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
- Check browser policy, incognito-like modes, and origin/storage restrictions in the candidate environment.
- Both Chromium headless modes report HeadlessChrome in the user agent: the headless shell (Playwright's default chromium_headless_shell) and new headless mode (`--headless=new`, Playwright's `channel: 'chromium'`). Only a headed browser reports Chrome. Client hint brands name HeadlessChrome only for the headless shell. Confirm whether this environment is meant to run headless and whether the baseline does.
- Software rendering is normal in headless, Docker, and CI without a GPU, and is forced by --disable-gpu. Check the launch flags and whether a GPU is available in the candidate environment.
- Check the container or CI image for installed fonts (for example `fc-list`). Minimal Docker images frequently ship none.
- Set a locale on the context (Playwright `locale`, Puppeteer `--lang`/`--accept-lang`) or in the container environment, matching the baseline.
