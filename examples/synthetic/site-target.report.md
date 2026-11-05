# Botprint Profile: synthetic-site-target

## Summary
- Browser: Chrome/147.0.0.0
- Target: https://app.example.test/dashboard
- Findings: 1

## Browser Context
- Probe context: existing target SYNTHETIC_TARGET_1
- User agent: Mozilla/5.0 (Synthetic) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36
- Platform: SyntheticPlatform
- Language: en-US; languages=["en-US","en"]
- Timezone: America/New_York
- Viewport: 1440x900 @ 2; outer 1440x980

## Key Signals
- WebDriver: false; window.chrome: true
- WebGL: ANGLE Metal Renderer: Synthetic GPU
- Canvas: stable; audio: available
- Fonts: 9 of 31 common fonts detected
- Storage: cookies=true, indexedDB=error
- Accept-Language: (not captured)

## Measurement Notes
- This existing-target profile may reflect page scripts, framework state, service workers, CSP, cookies, or application state.

## Top Findings
- **IndexedDB is unavailable** (compatibility_risk): IndexedDB status is error.

## Suggested Investigation
- Check browser policy, incognito-like modes, and origin/storage restrictions in the candidate environment.
