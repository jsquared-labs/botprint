import { describe, expect, test } from "bun:test";
import { compareProfiles } from "../src/compare";
import { sampleProfile } from "./fixtures/profile";

describe("compareProfiles", () => {
  test("returns a none verdict for identical profiles", () => {
    const baseline = sampleProfile();
    const candidate = sampleProfile();

    const result = compareProfiles({ baseline, baselinePath: "baseline.json", candidate, candidatePath: "candidate.json" });

    expect(result.diffs).toEqual([]);
    expect(result.verdict).toEqual({
      level: "none",
      material: false,
      categories: [],
      warnings: [],
    });
  });

  test("keeps browser-version drift advisory", () => {
    const baseline = sampleProfile();
    const candidate = sampleProfile({ cdp: { product: "Chrome/148.0.0.0" } });

    const result = compareProfiles({ baseline, baselinePath: "baseline.json", candidate, candidatePath: "candidate.json" });

    expect(result.verdict.level).toBe("advisory");
    expect(result.verdict.material).toBe(false);
    expect(result.verdict.warnings).toEqual([]);
    expect(result.diffs.map((diff) => diff.id)).toEqual(["cdp.product_changed"]);
  });

  test("warns without escalating when browser binary family changes", () => {
    const baseline = sampleProfile({ cdp: { product: "Chrome/147.0.0.0" } });
    const candidate = sampleProfile({ cdp: { product: "HeadlessChrome/145.0.0.0" } });

    const result = compareProfiles({ baseline, baselinePath: "baseline.json", candidate, candidatePath: "candidate.json" });

    expect(result.verdict.level).toBe("advisory");
    expect(result.verdict.material).toBe(false);
    expect(result.verdict.warnings).toEqual([
      {
        id: "comparison.browser_binary_mismatch",
        summary: "Baseline and candidate were collected from different browser binaries.",
        implications: "Diffs below may include artifacts of the binary difference, not environment drift alone.",
        evidence: {
          baseline_product: "Chrome/147.0.0.0",
          candidate_product: "HeadlessChrome/145.0.0.0",
        },
      },
    ]);
  });

  test("warns when browser major versions differ by two or more", () => {
    const baseline = sampleProfile({ cdp: { product: "Chrome/147.0.0.0" } });
    const candidate = sampleProfile({ cdp: { product: "Chrome/145.0.0.0" } });

    const result = compareProfiles({ baseline, baselinePath: "baseline.json", candidate, candidatePath: "candidate.json" });

    expect(result.verdict.warnings.map((warning) => warning.id)).toEqual(["comparison.browser_binary_mismatch"]);
  });

  test("warns when probe contexts differ", () => {
    const baseline = sampleProfile();
    const candidate = sampleProfile({
      source: {
        probe_context: "existing-target",
        target_id: "page-1",
        target_type: "page",
        probe_warnings: ["page-contamination-possible"],
      },
    });

    const result = compareProfiles({ baseline, baselinePath: "baseline.json", candidate, candidatePath: "candidate.json" });

    expect(result.verdict.warnings).toContainEqual({
      id: "comparison.probe_context_mismatch",
      summary: "Profiles were collected with different probe contexts.",
      implications: "Diffs may include artifacts of page state, framework behavior, or measurement mode rather than browser-environment drift alone.",
      evidence: {
        baseline_probe_context: "local-diagnostic-page",
        candidate_probe_context: "existing-target",
      },
    });
  });

  test("serializes missing diff sides explicitly", () => {
    const baseline = sampleProfile();
    const candidate = sampleProfile();
    delete candidate.signals.rendering.canvas.hash;

    const result = compareProfiles({ baseline, baselinePath: "baseline.json", candidate, candidatePath: "candidate.json" });
    const diff = result.diffs.find((item) => item.id === "rendering.canvas_hash_changed");

    expect(diff?.baseline).toBe("abc123");
    expect(diff?.candidate).toEqual({ kind: "absent" });
    expect(JSON.stringify(result)).toContain('"candidate":{"kind":"absent"}');
  });

  test("marks lost storage capability material", () => {
    const baseline = sampleProfile();
    const candidate = sampleProfile({ storage: { indexed_db: "error" } });

    const result = compareProfiles({ baseline, baselinePath: "baseline.json", candidate, candidatePath: "candidate.json" });

    expect(result.verdict.level).toBe("material");
    expect(result.verdict.material).toBe(true);
    expect(result.verdict.categories).toEqual(["storage"]);
    expect(result.diffs[0]?.id).toBe("storage.indexed_db_changed");
  });

  test("marks newly exposed automation as high confidence", () => {
    const baseline = sampleProfile();
    const candidate = sampleProfile({ automation: { webdriver: true } });

    const result = compareProfiles({ baseline, baselinePath: "baseline.json", candidate, candidatePath: "candidate.json" });

    expect(result.verdict.level).toBe("high_confidence_automation");
    expect(result.verdict.material).toBe(true);
    expect(result.verdict.categories).toEqual(["automation"]);
  });

});
