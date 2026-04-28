# Botprint Profile: synthetic-site-target

## Summary
- Browser: Chrome/147.0.0.0
- Target: https://app.example.test/dashboard
- Findings: 1

## Browser Context
- User agent: Mozilla/5.0 (Synthetic) AppleWebKit/537.36 Chrome/147.0.0.0 Safari/537.36
- Platform: SyntheticPlatform
- Timezone: America/New_York
- Viewport: 1440x900 @ 2

## Key Signals
- WebDriver: false
- WebGL: ANGLE Metal Renderer: Synthetic GPU
- Canvas: stable
- Storage: cookies=true, indexedDB=error

## Measurement Notes
- This existing-target profile may reflect page scripts, framework state, service workers, CSP, cookies, or application state.

## Top Findings
- **IndexedDB is unavailable** (compatibility_risk): IndexedDB status is error.

## Suggested Investigation
- Check browser policy, incognito-like modes, and origin/storage restrictions in the candidate environment.
