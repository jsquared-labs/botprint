import { describe, expect, test } from "bun:test";
import { compareProfiles } from "../src/compare";
import { analyzeProfile } from "../src/findings";
import { renderAgentCompareExplanation, renderAgentProfileExplanation, renderCompareMarkdown, renderProfileMarkdown } from "../src/render";
import { sampleProfile } from "./fixtures/profile";

describe("renderProfileMarkdown", () => {
  test("renders bounded profile report from structured findings", () => {
    const profile = sampleProfile({ automation: { webdriver: true } });
    const report = renderProfileMarkdown(profile, analyzeProfile(profile));

    expect(report).toContain("# Botprint Profile: fixture");
    expect(report).toContain("## Summary");
    expect(report).toContain("## Top Findings");
    expect(report).toContain("navigator.webdriver is exposed");
    expect(report).not.toContain("signals.identity");
  });

  test("renders existing-target measurement notes", () => {
    const profile = sampleProfile({
      source: {
        probe_context: "existing-target",
        target_id: "page-1",
        target_type: "page",
        probe_warnings: ["page-contamination-possible"],
      },
    });

    const report = renderProfileMarkdown(profile, analyzeProfile(profile));

    expect(report).toContain("## Measurement Notes");
    expect(report).toContain("existing-target profile may reflect page scripts");
  });

  test("notes when profile findings are truncated", () => {
    const profile = sampleProfile({
      automation: {
        webdriver: true,
        globals: {
          "cdc_*": true,
          "__webdriver_*": false,
        },
      },
      identity: { plugins_count: 0 },
      viewport: { width: 800, height: 600, device_scale_factor: 1 },
      rendering: {
        webgl: {
          status: "available",
          renderer: "SwiftShader",
          unmasked_renderer: "SwiftShader",
        },
        canvas: { status: "unstable" },
      },
      storage: { cookies_enabled: false, indexed_db: "error" },
      permissions: { geolocation: "error" },
      webrtc: { host_candidate_gathering: "error" },
    });
    const report = renderProfileMarkdown(profile, analyzeProfile(profile));

    expect(report).toContain("Showing top 5 of");
    expect(report).toContain("Use `--json` for the full finding list.");
  });
});

describe("renderCompareMarkdown", () => {
  test("renders bounded compare report from structured diffs", () => {
    const result = compareProfiles({
      baseline: sampleProfile(),
      baselinePath: "baseline.json",
      candidate: sampleProfile({
        automation: { webdriver: true },
        viewport: { width: 800 },
      }),
      candidatePath: "candidate.json",
    });

    const report = renderCompareMarkdown(result);

    expect(report).toContain("# Botprint Compare: fixture -> fixture");
    expect(report).toContain("Verdict: high_confidence_automation");
    expect(report).toContain("## Top Differences");
    expect(report).toContain("signals.automation.webdriver");
  });

  test("hoists compare warnings above top differences", () => {
    const result = compareProfiles({
      baseline: sampleProfile({ cdp: { product: "Chrome/147.0.0.0" } }),
      baselinePath: "baseline.json",
      candidate: sampleProfile({ cdp: { product: "HeadlessChrome/145.0.0.0" } }),
      candidatePath: "candidate.json",
    });

    const report = renderCompareMarkdown(result);

    expect(report).toContain("## Warnings");
    expect(report).toContain("- Warnings: comparison.browser_binary_mismatch");
    expect(report).toContain("comparison.browser_binary_mismatch");
    expect(report).toContain("Diffs below may include artifacts of the binary difference");
    expect(report.indexOf("## Warnings")).toBeLessThan(report.indexOf("## Top Differences"));
  });

  test("renders missing diff sides as absent", () => {
    const candidate = sampleProfile();
    delete candidate.signals.rendering.canvas.hash;
    const result = compareProfiles({
      baseline: sampleProfile(),
      baselinePath: "baseline.json",
      candidate,
      candidatePath: "candidate.json",
    });

    const report = renderCompareMarkdown(result);

    expect(report).toContain("signals.rendering.canvas.hash");
    expect(report).toContain('"abc123" -> <absent>');
  });

  test("notes when compare differences are truncated", () => {
    const result = compareProfiles({
      baseline: sampleProfile(),
      baselinePath: "baseline.json",
      candidate: sampleProfile({
        automation: { webdriver: true },
        identity: { plugins_count: 0, mime_types_count: 0 },
        viewport: { width: 800 },
        rendering: { webgl: { status: "available", unmasked_renderer: "SwiftShader" } },
        storage: { indexed_db: "error" },
        cdp: { product: "HeadlessChrome/145.0.0.0" },
      }),
      candidatePath: "candidate.json",
    });

    const report = renderCompareMarkdown(result);

    expect(result.diffs.length).toBeGreaterThan(5);
    expect(report).toContain("Showing top 5 of");
    expect(report).toContain("Use `--json` for the full diff list.");
  });
});

describe("agent renderers", () => {
  test("profile explanation stays at or below 200 words", () => {
    const profile = sampleProfile({ automation: { webdriver: true } });
    const explanation = renderAgentProfileExplanation(profile, analyzeProfile(profile));

    expect(wordCount(explanation)).toBeLessThanOrEqual(200);
    expect(explanation).toContain("automation.webdriver_exposed");
  });

  test("profile explanation includes existing-target measurement notes", () => {
    const profile = sampleProfile({
      source: {
        probe_context: "existing-target",
        target_id: "page-1",
        target_type: "page",
        probe_warnings: ["page-contamination-possible"],
      },
    });

    const explanation = renderAgentProfileExplanation(profile, analyzeProfile(profile));

    expect(wordCount(explanation)).toBeLessThanOrEqual(200);
    expect(explanation).toContain("Measurement notes:");
    expect(explanation).toContain("existing-target profile may reflect page scripts");
  });

  test("compare explanation stays at or below 200 words", () => {
    const result = compareProfiles({
      baseline: sampleProfile(),
      baselinePath: "baseline.json",
      candidate: sampleProfile({ automation: { webdriver: true } }),
      candidatePath: "candidate.json",
    });

    const explanation = renderAgentCompareExplanation(result);

    expect(wordCount(explanation)).toBeLessThanOrEqual(200);
    expect(explanation).toContain("verdict high_confidence_automation");
  });

  test("compare explanation includes warnings when present", () => {
    const result = compareProfiles({
      baseline: sampleProfile({ cdp: { product: "Chrome/147.0.0.0" } }),
      baselinePath: "baseline.json",
      candidate: sampleProfile({ cdp: { product: "HeadlessChrome/145.0.0.0" } }),
      candidatePath: "candidate.json",
    });

    const explanation = renderAgentCompareExplanation(result);

    expect(wordCount(explanation)).toBeLessThanOrEqual(200);
    expect(explanation).toContain("Warnings:");
    expect(explanation).toContain("comparison.browser_binary_mismatch");
    expect(explanation).toContain("Diffs below may include artifacts of the binary difference");
  });
});

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
