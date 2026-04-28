import { describe, expect, test } from "bun:test";
import { EXIT_CODES } from "../src/exit-codes";
import { BotprintError } from "../src/errors";
import { validateProfile } from "../src/profile";
import { sampleProfile } from "./fixtures/profile";

describe("validateProfile", () => {
  test("accepts the P0 profile shape", () => {
    const profile = sampleProfile();
    expect(validateProfile(profile)).toEqual(profile);
  });

  test("accepts existing-target profile metadata", () => {
    const profile = sampleProfile({
      source: {
        probe_context: "existing-target",
        target_id: "page-1",
        target_type: "page",
        probe_warnings: ["page-contamination-possible"],
      },
    });

    const validated = validateProfile(profile);

    expect(validated.source.probe_context).toBe("existing-target");
    expect(validated.source.target_id).toBe("page-1");
    expect(validated.source.probe_warnings).toEqual(["page-contamination-possible"]);
  });

  test("rejects unsupported schema versions with schema exit code", () => {
    const profile = { ...sampleProfile(), schema_version: "1.0" };

    try {
      validateProfile(profile);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(BotprintError);
      if (error instanceof BotprintError) {
        expect(error.exitCode).toBe(EXIT_CODES.schemaValidation);
      }
    }
  });
});
