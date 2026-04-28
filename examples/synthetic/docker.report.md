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
