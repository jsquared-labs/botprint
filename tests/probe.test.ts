import { describe, expect, test } from "bun:test";
import { buildProbeExpression, DEFAULT_PROBE_TIMEOUT_MS, FONT_CHECK_LIST } from "../src/probe";

describe("buildProbeExpression", () => {
  test("produces syntactically valid JavaScript", () => {
    // The probe runs as a string inside the browser; a syntax error would only surface at runtime.
    expect(() => new Function(`return ${buildProbeExpression(DEFAULT_PROBE_TIMEOUT_MS)}`)).not.toThrow();
  });

  test("embeds the requested timeout and falls back to the default for invalid values", () => {
    expect(buildProbeExpression(750)).toContain("const PROBE_TIMEOUT_MS = 750;");
    expect(buildProbeExpression(0)).toContain(`const PROBE_TIMEOUT_MS = ${DEFAULT_PROBE_TIMEOUT_MS};`);
    expect(buildProbeExpression(Number.NaN)).toContain(`const PROBE_TIMEOUT_MS = ${DEFAULT_PROBE_TIMEOUT_MS};`);
  });

  test("embeds the font check list", () => {
    const expression = buildProbeExpression(DEFAULT_PROBE_TIMEOUT_MS);
    for (const font of FONT_CHECK_LIST) {
      expect(expression).toContain(JSON.stringify(font));
    }
  });
});
