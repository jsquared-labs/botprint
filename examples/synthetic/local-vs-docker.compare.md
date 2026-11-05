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

## Interpretation
The candidate differs materially from the baseline across automation, cdp, environment, http, identity, permissions, rendering, storage signals.
