# Botprint Compare: synthetic-local -> synthetic-site-target

## Summary
- Verdict: material
- Material: yes
- Differences: 8
- Categories: permissions, rendering, storage
- Warnings: comparison.probe_context_mismatch

## Warnings
- **comparison.probe_context_mismatch**: Profiles were collected with different probe contexts. Diffs may include artifacts of page state, framework behavior, or measurement mode rather than browser-environment drift alone. (baseline_probe_context="local-diagnostic-page", candidate_probe_context="existing-target")

## Top Differences
_Showing top 5 of 8 differences. Use `--json` for the full diff list._
- **localStorage availability changed** (material): signals.storage.local_storage "available" -> "error"
- **sessionStorage availability changed** (material): signals.storage.session_storage "available" -> "error"
- **IndexedDB availability changed** (material): signals.storage.indexed_db "available" -> "error"
- **Canvas hash changed** (advisory): signals.rendering.canvas.hash "synthetic-local-canvas" -> "synthetic-site-canvas"
- **Permission state changed for camera** (advisory): signals.permissions.camera "prompt" -> "denied"

## Interpretation
The candidate differs materially from the baseline across permissions, rendering, storage signals.
