import { describe, expect, test } from "bun:test";
import { BOTPRINT_VERSION } from "../src/version";

type PackageJson = {
  version?: unknown;
};

describe("BOTPRINT_VERSION", () => {
  test("matches package.json version", async () => {
    const packageJson = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as PackageJson;

    expect(typeof packageJson.version).toBe("string");
    if (typeof packageJson.version !== "string") {
      throw new Error("package.json version must be a string.");
    }
    expect(BOTPRINT_VERSION).toBe(packageJson.version);
  });
});
