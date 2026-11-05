import { describe, expect, test } from "bun:test";
import { compareProfiles } from "../src/compare";
import { FIXTURE_USER_AGENT, sampleProfile } from "./fixtures/profile";

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
    const candidate = sampleProfile({ cdp: { product: "Firefox/145.0" } });

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
          candidate_product: "Firefox/145.0",
        },
      },
    ]);
  });

  test("treats Chrome and HeadlessChrome at the same version as a mode difference, not a binary mismatch", () => {
    const baseline = sampleProfile({ cdp: { product: "Chrome/153.0.8010.12" } });
    const candidate = sampleProfile({ cdp: { product: "HeadlessChrome/153.0.8010.12" } });

    const result = compareProfiles({ baseline, baselinePath: "baseline.json", candidate, candidatePath: "candidate.json" });

    expect(result.verdict.warnings.map((warning) => warning.id)).toEqual(["comparison.headless_mode_mismatch"]);
  });

  test("ignores build-number noise in user agent strings but not family or platform changes", () => {
    const baseline = sampleProfile();
    const sameMajor = sampleProfile({
      identity: { user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7320.55 Safari/537.36" },
    });
    const headless = sampleProfile({
      identity: { user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/147.0.0.0 Safari/537.36" },
    });
    const linux = sampleProfile({
      identity: { user_agent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36" },
    });

    const ids = (candidate: ReturnType<typeof sampleProfile>) =>
      compareProfiles({ baseline, baselinePath: "b.json", candidate, candidatePath: "c.json" }).diffs.map((diff) => diff.id);

    expect(ids(sameMajor)).toEqual([]);
    expect(ids(headless)).toEqual(["identity.user_agent_changed"]);
    expect(ids(linux)).toEqual(["identity.user_agent_changed"]);
  });

  test("warns when browser context sources differ", () => {
    const baseline = sampleProfile();
    const candidate = sampleProfile({ source: { browser_context_source: "browser-default", browser_context_id: undefined } });

    const result = compareProfiles({ baseline, baselinePath: "baseline.json", candidate, candidatePath: "candidate.json" });

    expect(result.verdict.warnings.map((warning) => warning.id)).toEqual(["comparison.browser_context_mismatch"]);
  });

  test("diffs request headers only when both profiles captured them, and treats Accept-Language as material", () => {
    const baseline = sampleProfile();
    const noLanguage = sampleProfile({
      http: { status: "captured", request_headers: { accept: "text/html,application/xhtml+xml", "sec-ch-ua": '"Chromium";v="147", "Google Chrome";v="147"', "user-agent": FIXTURE_USER_AGENT } },
    });
    const notCaptured = sampleProfile({ http: null });

    const withLanguageLoss = compareProfiles({ baseline, baselinePath: "b.json", candidate: noLanguage, candidatePath: "c.json" });
    expect(withLanguageLoss.diffs.map((diff) => [diff.id, diff.level])).toEqual([["http.header.accept-language_changed", "material"]]);
    expect(withLanguageLoss.diffs[0]?.candidate).toEqual({ kind: "absent" });
    expect(withLanguageLoss.verdict.categories).toEqual(["http"]);

    const skipped = compareProfiles({ baseline, baselinePath: "b.json", candidate: notCaptured, candidatePath: "c.json" });
    expect(skipped.diffs).toEqual([]);
    expect(skipped.verdict.warnings.map((warning) => warning.id)).toEqual(["comparison.http_not_captured"]);
  });

  test("marks lost fonts material and gained fonts advisory", () => {
    const baseline = sampleProfile();
    const lost = sampleProfile({ rendering: { fonts: { detected: ["Arial"] } } });
    const gained = sampleProfile({ rendering: { fonts: { detected: [...baseline.signals.rendering.fonts.detected, "Roboto"] } } });

    expect(compareProfiles({ baseline, baselinePath: "b.json", candidate: lost, candidatePath: "c.json" }).diffs[0]?.level).toBe("material");
    expect(compareProfiles({ baseline, baselinePath: "b.json", candidate: gained, candidatePath: "c.json" }).diffs[0]?.level).toBe("advisory");
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

  test("warns on headless mode when only the user agent says headless (new headless mode)", () => {
    // Chrome 156 --headless=new on macOS: CDP product "Chrome/156.0.8078.80", UA "HeadlessChrome/156.0.0.0".
    const baseline = sampleProfile();
    const candidate = sampleProfile({
      identity: { user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/147.0.0.0 Safari/537.36" },
    });

    const result = compareProfiles({ baseline, baselinePath: "b.json", candidate, candidatePath: "c.json" });

    expect(result.diffs.map((diff) => diff.id)).toEqual(["identity.user_agent_changed"]);
    expect(result.verdict.warnings.map((warning) => [warning.id, warning.summary])).toEqual([
      ["comparison.headless_mode_mismatch", "One profile came from a headless browser and the other from a headed one."],
    ]);
  });

  test("describes headless shell vs new headless as a shell difference without a user agent diff", () => {
    const headlessUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/147.0.0.0 Safari/537.36";
    const shell = sampleProfile({ identity: { user_agent: headlessUa }, cdp: { product: "HeadlessChrome/147.0.0.0" } });
    const newHeadless = sampleProfile({ identity: { user_agent: headlessUa }, cdp: { product: "Chrome/147.0.0.0" } });

    const result = compareProfiles({ baseline: shell, baselinePath: "b.json", candidate: newHeadless, candidatePath: "c.json" });

    expect(result.diffs.map((diff) => diff.id)).toEqual(["cdp.product_changed"]);
    expect(result.verdict.warnings.map((warning) => warning.summary)).toEqual(["One profile came from the headless shell binary and the other from a headed or new-headless build."]);
  });

  test("ignores build-number noise in the user-agent request header too", () => {
    const baseline = sampleProfile();
    const candidate = sampleProfile({
      http: {
        status: "captured",
        request_headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.9",
          "sec-ch-ua": '"Chromium";v="147", "Google Chrome";v="147"',
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7320.55 Safari/537.36",
        },
      },
    });

    expect(compareProfiles({ baseline, baselinePath: "b.json", candidate, candidatePath: "c.json" }).diffs).toEqual([]);
  });
});
