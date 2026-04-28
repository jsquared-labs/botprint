import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { validateProfile } from "../src/profile";

const EXAMPLES_DIR = join(import.meta.dir, "..", "examples", "synthetic");

describe("synthetic examples", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir !== undefined) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  test("profile examples are schema-valid synthetic profiles", async () => {
    const files = (await readdir(EXAMPLES_DIR)).filter((file) => file.endsWith(".profile.json")).sort();

    expect(files).toEqual(["docker.profile.json", "local.profile.json", "site-target.profile.json"]);

    for (const file of files) {
      const profile = validateProfile(JSON.parse(await readFile(join(EXAMPLES_DIR, file), "utf8")));
      expect(profile.source.label).toStartWith("synthetic-");
    }
  });

  test("compare examples include interpretation warnings", async () => {
    const localVsDocker = JSON.parse(await readFile(join(EXAMPLES_DIR, "local-vs-docker.compare.json"), "utf8"));
    const localVsTarget = JSON.parse(await readFile(join(EXAMPLES_DIR, "local-vs-site-target.compare.json"), "utf8"));

    expect(localVsDocker.verdict.warnings.map((warning: { id: string }) => warning.id)).toContain("comparison.browser_binary_mismatch");
    expect(localVsTarget.verdict.warnings.map((warning: { id: string }) => warning.id)).toContain("comparison.probe_context_mismatch");
    expect(localVsDocker.verdict.warnings[0].summary).toBeString();
    expect(localVsDocker.verdict.warnings[0].implications).toBeString();
  });

  test("generator output matches committed examples", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "botprint-examples-test-"));
    tempDirs.push(tempDir);
    const generatedDir = join(tempDir, "synthetic");
    const script = join(import.meta.dir, "..", "scripts", "generate-examples.ts");
    const proc = Bun.spawn(["bun", "run", script], {
      env: {
        ...process.env,
        BOTPRINT_EXAMPLES_OUT_DIR: generatedDir,
      },
      stdout: "ignore",
      stderr: "pipe",
    });
    const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(await readTree(generatedDir)).toEqual(await readTree(EXAMPLES_DIR));
  });
});

async function readTree(dir: string): Promise<Record<string, string>> {
  const files = (await readdir(dir)).sort();
  const out: Record<string, string> = {};
  for (const file of files) {
    out[file] = await readFile(join(dir, file), "utf8");
  }
  return out;
}
