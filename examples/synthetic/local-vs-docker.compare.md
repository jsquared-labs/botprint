# Botprint Compare: synthetic-local -> synthetic-docker

## Summary
- Verdict: material
- Material: yes
- Differences: 15
- Categories: cdp, environment, identity, permissions, rendering, storage
- Warnings: comparison.browser_binary_mismatch

## Warnings
- **comparison.browser_binary_mismatch**: Baseline and candidate were collected from different browser binaries. Diffs below may include artifacts of the binary difference, not environment drift alone. (baseline_product="Chrome/147.0.0.0", candidate_product="HeadlessChrome/145.0.0.0")

## Top Differences
_Showing top 5 of 15 differences. Use `--json` for the full diff list._
- **Timezone changed** (material): signals.environment.timezone "America/New_York" -> "UTC"
- **WebGL renderer changed** (material): signals.rendering.webgl.unmasked_renderer "ANGLE Metal Renderer: Synthetic GPU" -> "SwiftShader Device (Synthetic)"
- **IndexedDB availability changed** (material): signals.storage.indexed_db "available" -> "error"
- **Service worker availability changed** (material): signals.storage.service_worker "available" -> "unavailable"
- **User agent changed** (advisory): signals.identity.user_agent "Mozilla/5.0 (Synthetic) AppleWebKit/537.36 Chrome/147.0.0.0 Safari/537.36" -> "Mozilla/5.0 (Synthetic) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36"

## Interpretation
The candidate differs materially from the baseline across cdp, environment, identity, permissions, rendering, storage signals.
