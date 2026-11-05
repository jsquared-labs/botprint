import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { compareProfiles } from "../src/compare";
import { EXIT_CODES } from "../src/exit-codes";
import { parseArgs, renderHelp, runCli } from "../src/cli";
import { sampleProfile } from "./fixtures/profile";

describe("parseArgs", () => {
  test("returns help when no command is provided", () => {
    expect(parseArgs([])).toEqual({
      ok: true,
      command: { command: "help", options: { topic: undefined } },
    });
  });

  test("parses run flags", () => {
    expect(
      parseArgs([
        "run",
        "--cdp",
        "http://localhost:9222",
        "--out",
        "local.profile.json",
        "--label",
        "local",
        "--timeout",
        "5000",
        "--auth-header",
        "Authorization: Bearer token",
      ]),
    ).toEqual({
      ok: true,
      command: {
        command: "run",
        options: {
          cdp: "http://localhost:9222",
          out: "local.profile.json",
          json: false,
          quiet: false,
          label: "local",
          timeout: 5000,
          probeTimeout: undefined,
          authHeaders: ["Authorization: Bearer token"],
          diagnosticBind: undefined,
          diagnosticHost: undefined,
          context: undefined,
          target: undefined,
          targetUrl: undefined,
        },
      },
    });
  });

  test("parses diagnostic page network options", () => {
    expect(
      parseArgs([
        "run",
        "--cdp",
        "http://localhost:9222",
        "--out",
        "docker.profile.json",
        "--diagnostic-bind",
        "0.0.0.0",
        "--diagnostic-host",
        "host.docker.internal",
      ]),
    ).toEqual({
      ok: true,
      command: {
        command: "run",
        options: {
          cdp: "http://localhost:9222",
          out: "docker.profile.json",
          json: false,
          quiet: false,
          label: undefined,
          timeout: undefined,
          probeTimeout: undefined,
          authHeaders: [],
          diagnosticBind: "0.0.0.0",
          diagnosticHost: "host.docker.internal",
          context: undefined,
          target: undefined,
          targetUrl: undefined,
        },
      },
    });
  });

  test("parses existing-target run options", () => {
    expect(
      parseArgs([
        "run",
        "--cdp",
        "http://localhost:9222",
        "--out",
        "site.profile.json",
        "--target",
        "page-1",
      ]),
    ).toEqual({
      ok: true,
      command: {
        command: "run",
        options: {
          cdp: "http://localhost:9222",
          out: "site.profile.json",
          json: false,
          quiet: false,
          label: undefined,
          timeout: undefined,
          probeTimeout: undefined,
          authHeaders: [],
          diagnosticBind: undefined,
          diagnosticHost: undefined,
          context: undefined,
          target: "page-1",
          targetUrl: undefined,
        },
      },
    });
  });

  test("rejects --context on existing-target runs", () => {
    const parsed = parseArgs(["run", "--cdp", "http://localhost:9222", "--out", "x.json", "--target", "T1", "--context", "C1"]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.message).toBe("--context is only valid for fresh diagnostic-page runs.");
    }
  });

  test("parses --context and --probe-timeout for fresh runs", () => {
    const parsed = parseArgs(["run", "--cdp", "http://localhost:9222", "--out", "x.json", "--context", "default", "--probe-timeout", "5000"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok && parsed.command.command === "run") {
      expect(parsed.command.options.context).toBe("default");
      expect(parsed.command.options.probeTimeout).toBe(5000);
    }
  });

  test("rejects ambiguous existing-target selectors", () => {
    expect(parseArgs(["run", "--cdp", "http://localhost:9222", "--out", "site.profile.json", "--target", "page-1", "--target-url", "https://example.test"])).toEqual({
      ok: false,
      exitCode: EXIT_CODES.usage,
      message: "Use only one of --target or --target-url.",
    });
  });

  test("parses targets command", () => {
    expect(parseArgs(["targets", "--cdp", "http://localhost:9222", "--json"])).toEqual({
      ok: true,
      command: {
        command: "targets",
        options: {
          cdp: "http://localhost:9222",
          json: true,
          quiet: false,
          timeout: undefined,
          authHeaders: [],
        },
      },
    });
  });

  test("rejects run without required flags", () => {
    expect(parseArgs(["run"])).toEqual({
      ok: false,
      exitCode: EXIT_CODES.usage,
      message: "Missing required flag --cdp.",
    });
  });

  test("parses report command", () => {
    expect(parseArgs(["report", "local.profile.json", "--markdown", "local.report.md"])).toEqual({
      ok: true,
      command: {
        command: "report",
        options: {
          profilePath: "local.profile.json",
          markdown: "local.report.md",
          json: false,
          quiet: false,
        },
      },
    });
  });

  test("parses compare command", () => {
    expect(parseArgs(["compare", "baseline.json", "candidate.json", "--json"])).toEqual({
      ok: true,
      command: {
        command: "compare",
        options: {
          baselinePath: "baseline.json",
          candidatePath: "candidate.json",
          markdown: undefined,
          json: true,
          quiet: false,
        },
      },
    });
  });

  test("parses explain command", () => {
    expect(parseArgs(["explain", "candidate.json", "--for-agent", "--quiet"])).toEqual({
      ok: true,
      command: {
        command: "explain",
        options: {
          inputPath: "candidate.json",
          forAgent: true,
          json: false,
          quiet: true,
        },
      },
    });
  });

  test("parses guide command and tui alias", () => {
    expect(parseArgs(["guide"])).toEqual({
      ok: true,
      command: {
        command: "guide",
        options: {},
      },
    });
    expect(parseArgs(["tui"])).toEqual({
      ok: true,
      command: {
        command: "tui",
        options: {},
      },
    });
  });

  test("rejects unknown commands", () => {
    expect(parseArgs(["doctor"])).toEqual({
      ok: false,
      exitCode: EXIT_CODES.usage,
      message: "Unknown command: doctor",
    });
  });

  test("rejects unknown flags", () => {
    expect(parseArgs(["run", "--cdp", "http://localhost:9222", "--out", "local.json", "--bogus"])).toEqual({
      ok: false,
      exitCode: EXIT_CODES.usage,
      message: "Unknown flag: --bogus",
    });
  });

  test("rejects flags on the wrong command", () => {
    expect(parseArgs(["report", "local.json", "--cdp", "http://localhost:9222"])).toEqual({
      ok: false,
      exitCode: EXIT_CODES.usage,
      message: "Flag --cdp is not valid for report.",
    });
  });

  test("preserves '=' inside inline flag values", () => {
    const result = parseArgs([
      "run",
      "--cdp",
      "http://localhost:9222",
      "--out",
      "local.profile.json",
      "--label=local=primary",
    ]);
    expect(result.ok).toBe(true);
    if (result.ok && result.command.command === "run") {
      expect(result.command.options.label).toBe("local=primary");
    }
  });

  test("-h shows help; --h is not a hidden alias", () => {
    expect(parseArgs(["run", "-h"])).toEqual({
      ok: true,
      command: { command: "help", options: { topic: "run" } },
    });
    expect(parseArgs(["run", "--h"])).toEqual({
      ok: false,
      exitCode: EXIT_CODES.usage,
      message: "Unknown flag: --h",
    });
  });
});

describe("renderHelp", () => {
  test("renders top-level command list", () => {
    expect(renderHelp()).toContain("Commands:");
    expect(renderHelp()).toContain("compare");
    expect(renderHelp()).toContain("targets");
    expect(renderHelp()).toContain("guide");
  });

  test("renders compare exit code semantics", () => {
    expect(renderHelp("compare")).toContain("1  Material differences found.");
  });

  test("renders target-mode help", () => {
    expect(renderHelp("run")).toContain("Use --target to evaluate an existing page target in place.");
    expect(renderHelp("run")).toContain("--context <id|default>");
    expect(renderHelp("run")).toContain("--probe-timeout <ms>");
    expect(renderHelp("targets")).toContain("List existing page targets");
  });

  test("renders guide help", () => {
    expect(renderHelp("guide")).toContain("guided terminal flow");
  });
});

describe("runCli compare", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir !== undefined) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  test("returns success for advisory-only differences", async () => {
    const paths = await writeProfiles(tempDirs, sampleProfile(), sampleProfile({ cdp: { product: "Chrome/148.0.0.0" } }));
    const io = captureIo();

    const exitCode = await runCli(["compare", paths.baseline, paths.candidate, "--quiet"], io);

    expect(exitCode).toBe(EXIT_CODES.success);
    expect(io.logs).toEqual([]);
  });

  test("returns material-difference exit code for material differences", async () => {
    const paths = await writeProfiles(tempDirs, sampleProfile(), sampleProfile({ automation: { webdriver: true } }));
    const io = captureIo();

    const exitCode = await runCli(["compare", paths.baseline, paths.candidate, "--quiet"], io);

    expect(exitCode).toBe(EXIT_CODES.materialDifferences);
    expect(io.logs).toEqual([]);
  });
});

describe("runCli report and explain", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir !== undefined) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  test("writes Markdown report output", async () => {
    const paths = await writeProfiles(tempDirs, sampleProfile({ automation: { webdriver: true } }), sampleProfile());
    const markdownPath = join(paths.dir, "report.md");
    const io = captureIo();

    const exitCode = await runCli(["report", paths.baseline, "--markdown", markdownPath, "--quiet"], io);

    expect(exitCode).toBe(EXIT_CODES.success);
    expect(await Bun.file(markdownPath).text()).toContain("# Botprint Profile: fixture");
    expect(io.logs).toEqual([]);
  });

  test("renders agent explanation for profile input", async () => {
    const paths = await writeProfiles(tempDirs, sampleProfile({ automation: { webdriver: true } }), sampleProfile());
    const io = captureIo();

    const exitCode = await runCli(["explain", paths.baseline, "--for-agent"], io);

    expect(exitCode).toBe(EXIT_CODES.success);
    expect(io.logs.join("\n")).toContain("automation.webdriver_exposed");
  });

  test("renders agent explanation for compare input", async () => {
    const paths = await writeProfiles(tempDirs, sampleProfile(), sampleProfile());
    const comparePath = join(paths.dir, "compare.json");
    await writeFile(
      comparePath,
      `${JSON.stringify(
        compareProfiles({
          baseline: sampleProfile(),
          baselinePath: "baseline.json",
          candidate: sampleProfile({ automation: { webdriver: true } }),
          candidatePath: "candidate.json",
        }),
        null,
        2,
      )}\n`,
      "utf8",
    );
    const io = captureIo();

    const exitCode = await runCli(["explain", comparePath, "--for-agent"], io);

    expect(exitCode).toBe(EXIT_CODES.success);
    expect(io.logs.join("\n")).toContain("verdict high_confidence_automation");
  });
});

async function writeProfiles(tempDirs: string[], baseline: unknown, candidate: unknown): Promise<{ dir: string; baseline: string; candidate: string }> {
  const dir = await mkdtemp(join(tmpdir(), "botprint-cli-test-"));
  tempDirs.push(dir);
  const baselinePath = join(dir, "baseline.json");
  const candidatePath = join(dir, "candidate.json");
  await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
  return { dir, baseline: baselinePath, candidate: candidatePath };
}

function captureIo(): { logs: string[]; errors: string[]; log(message: string): void; error(message: string): void } {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    log(message: string) {
      logs.push(message);
    },
    error(message: string) {
      errors.push(message);
    },
  };
}
