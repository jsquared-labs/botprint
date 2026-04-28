#!/usr/bin/env bun

import { readFile, writeFile } from "node:fs/promises";
import { compareProfiles } from "./compare";
import { EXIT_CODES, type ExitCode } from "./exit-codes";
import { BotprintError } from "./errors";
import { analyzeProfile } from "./findings";
import { runGuide } from "./guide";
import { readProfile } from "./profile";
import { renderAgentExplanation, renderCompareMarkdown, renderProfileMarkdown } from "./render";
import { listTargets, runProfile } from "./run";

// Layout: command types and flag specs, parser helpers, command dispatch, then help text.
type CommandName = "run" | "targets" | "report" | "compare" | "explain" | "guide" | "tui" | "help";

type ParsedCommand =
  | {
      command: "run";
      options: {
        cdp: string;
        out: string;
        json: boolean;
        quiet: boolean;
        label: string | undefined;
        timeout: number | undefined;
        authHeaders: string[];
        diagnosticBind: string | undefined;
        diagnosticHost: string | undefined;
        target: string | undefined;
        targetUrl: string | undefined;
      };
    }
  | {
      command: "targets";
      options: {
        cdp: string;
        json: boolean;
        quiet: boolean;
        timeout: number | undefined;
        authHeaders: string[];
      };
    }
  | {
      command: "report";
      options: {
        profilePath: string;
        markdown: string | undefined;
        json: boolean;
        quiet: boolean;
      };
    }
  | {
      command: "compare";
      options: {
        baselinePath: string;
        candidatePath: string;
        markdown: string | undefined;
        json: boolean;
        quiet: boolean;
      };
    }
  | {
      command: "explain";
      options: {
        inputPath: string;
        forAgent: boolean;
        json: boolean;
        quiet: boolean;
      };
    }
  | {
      command: "guide" | "tui";
      options: Record<string, never>;
    }
  | {
      command: "help";
      options: {
        topic: CommandName | undefined;
      };
    };

type ParseResult =
  | {
      ok: true;
      command: ParsedCommand;
    }
  | ParseError;

type ParseError = {
  ok: false;
  exitCode: ExitCode;
  message: string;
};

type FlagValues = {
  values: Map<string, string[]>;
  positionals: string[];
};

const COMMANDS = new Set<CommandName>(["run", "targets", "report", "compare", "explain", "guide", "tui", "help"]);

const FLAG_SPEC: Record<string, { takesValue: boolean }> = {
  cdp: { takesValue: true },
  out: { takesValue: true },
  markdown: { takesValue: true },
  label: { takesValue: true },
  timeout: { takesValue: true },
  "auth-header": { takesValue: true },
  "diagnostic-bind": { takesValue: true },
  "diagnostic-host": { takesValue: true },
  target: { takesValue: true },
  "target-url": { takesValue: true },
  json: { takesValue: false },
  quiet: { takesValue: false },
  "for-agent": { takesValue: false },
  help: { takesValue: false },
};

const RUN_FLAGS = new Set(["auth-header", "cdp", "diagnostic-bind", "diagnostic-host", "json", "label", "out", "quiet", "target", "target-url", "timeout"]);
const TARGETS_FLAGS = new Set(["auth-header", "cdp", "json", "quiet", "timeout"]);
const REPORT_FLAGS = new Set(["json", "markdown", "quiet"]);
const COMPARE_FLAGS = new Set(["json", "markdown", "quiet"]);
const EXPLAIN_FLAGS = new Set(["for-agent", "json", "quiet"]);
const GUIDE_FLAGS = new Set<string>();

export function parseArgs(argv: string[]): ParseResult {
  const [rawCommand, ...rest] = argv;

  if (rawCommand === undefined || rawCommand === "--help" || rawCommand === "-h") {
    return { ok: true, command: { command: "help", options: { topic: undefined } } };
  }

  if (!isCommand(rawCommand)) {
    return usageError(`Unknown command: ${rawCommand}`);
  }

  if (rawCommand === "help") {
    const topic = rest[0];
    if (topic !== undefined && !isCommand(topic)) {
      return usageError(`Unknown help topic: ${topic}`);
    }
    return { ok: true, command: { command: "help", options: { topic } } };
  }

  const flags = collectFlags(rest);
  if (!flags.ok) {
    return flags;
  }

  if (flagEnabled(flags.parsed, "help")) {
    return { ok: true, command: { command: "help", options: { topic: rawCommand } } };
  }

  switch (rawCommand) {
    case "run":
      return parseRun(flags.parsed);
    case "targets":
      return parseTargets(flags.parsed);
    case "report":
      return parseReport(flags.parsed);
    case "compare":
      return parseCompare(flags.parsed);
    case "explain":
      return parseExplain(flags.parsed);
    case "guide":
    case "tui":
      return parseGuide(flags.parsed, rawCommand);
    default:
      return assertNever(rawCommand);
  }
}

export function renderHelp(topic?: CommandName): string {
  if (topic === "run") {
    return [
      "Usage: botprint run --cdp <url> --out <profile.json> [options]",
      "",
      "Collect a browser-visible profile from an existing CDP endpoint.",
      "Default: creates a fresh diagnostic page. Use --target to evaluate an existing page target.",
      "",
      "Options:",
      "  --cdp <url>              CDP HTTP, WS, or WSS endpoint.",
      "  --out <path>             Profile JSON output path.",
      "  --label <name>           Label stored in source.label and report headings.",
      "  --timeout <ms>           Operation timeout in milliseconds.",
      "  --auth-header <header>   Extra header for remote CDP endpoints. Repeatable.",
      "  --diagnostic-bind <addr> Interface for Botprint's diagnostic page. Default: 127.0.0.1.",
      "  --diagnostic-host <host> Hostname the browser uses to reach the diagnostic page (e.g. host.docker.internal).",
      "  --target <targetId>      Existing CDP page target to evaluate without closing or navigating it.",
      "  --target-url <prefix>    Resolve one existing page target by URL prefix.",
      "  --json                   Emit machine-readable command output.",
      "  --quiet                  Suppress non-essential output.",
    ].join("\n");
  }

  if (topic === "targets") {
    return [
      "Usage: botprint targets --cdp <url> [options]",
      "",
      "List existing page targets exposed by a CDP endpoint.",
      "",
      "Options:",
      "  --cdp <url>              CDP HTTP, WS, or WSS endpoint.",
      "  --timeout <ms>           Operation timeout in milliseconds.",
      "  --auth-header <header>   Extra header for remote CDP endpoints. Repeatable.",
      "  --json                   Emit machine-readable target list.",
      "  --quiet                  Suppress non-essential output.",
    ].join("\n");
  }

  if (topic === "report") {
    return [
      "Usage: botprint report <profile.json> --markdown <report.md> [options]",
      "",
      "Render a human-readable report from a Botprint profile.",
      "",
      "Options:",
      "  --markdown <path>        Markdown report output path.",
      "  --json                   Emit machine-readable command output.",
      "  --quiet                  Suppress non-essential output.",
    ].join("\n");
  }

  if (topic === "compare") {
    return [
      "Usage: botprint compare <baseline.json> <candidate.json> [options]",
      "",
      "Compare two Botprint profiles and report material browser-environment drift.",
      "Compare JSON includes per-diff level values and verdict warnings that may affect interpretation quality.",
      "",
      "Options:",
      "  --markdown <path>        Markdown comparison output path.",
      "  --json                   Emit machine-readable command output.",
      "  --quiet                  Suppress non-essential output.",
      "",
      "Exit codes:",
      "  0  No material differences found.",
      "  1  Material differences found.",
      "  2  Usage error.",
      "  5  Schema or validation error.",
    ].join("\n");
  }

  if (topic === "explain") {
    return [
      "Usage: botprint explain <profile-or-compare.json> --for-agent [options]",
      "",
      "Render a compact explanation for Codex, Claude Code, Cursor, or GitHub issues.",
      "",
      "Options:",
      "  --for-agent             Emit agent-oriented Markdown.",
      "  --json                  Emit machine-readable command output.",
      "  --quiet                 Suppress non-essential output.",
    ].join("\n");
  }

  if (topic === "guide" || topic === "tui") {
    return [
      "Usage: botprint guide",
      "",
      "Run a guided terminal flow over Botprint's existing commands.",
      "",
      "The guide helps collect profiles, list targets, compare profiles, render reports, and generate agent explanations.",
    ].join("\n");
  }

  return [
    "Usage: botprint <command> [options]",
    "",
    "Botprint shows what your automated browser looks like to the web, and what changed from your baseline.",
    "",
    "Commands:",
    "  run       Collect a profile from an existing CDP endpoint.",
    "  targets   List existing page targets from a CDP endpoint.",
    "  report    Render a Markdown report from a profile.",
    "  compare   Compare a baseline profile against a candidate profile.",
    "  explain   Render a compact agent-friendly diagnosis.",
    "  guide     Run a guided terminal flow. Alias: tui.",
    "",
    "Run `botprint help <command>` for command-specific help.",
  ].join("\n");
}

export async function runCli(argv: string[], io: Pick<typeof console, "log" | "error"> = console): Promise<ExitCode> {
  const parsed = parseArgs(argv);

  if (!parsed.ok) {
    io.error(parsed.message);
    io.error("");
    io.error(renderHelp());
    return parsed.exitCode;
  }

  if (parsed.command.command === "help") {
    io.log(renderHelp(parsed.command.options.topic));
    return EXIT_CODES.success;
  }

  try {
    return await runCommand(parsed.command, io);
  } catch (error) {
    if (error instanceof BotprintError) {
      io.error(error.message);
      return error.exitCode;
    }

    io.error(error instanceof Error ? error.message : String(error));
    return EXIT_CODES.probeFailure;
  }
}

async function runCommand(command: Exclude<ParsedCommand, { command: "help" }>, io: Pick<typeof console, "log">): Promise<ExitCode> {
  switch (command.command) {
    case "run": {
      const profile = await runProfile(command.options);
      if (!command.options.quiet) {
        io.log(`Wrote Botprint profile to ${command.options.out}`);
        io.log(`Browser: ${profile.source.browser_version || "unknown"}`);
        io.log(`Target: ${profile.source.target_url}`);
      }
      return EXIT_CODES.success;
    }
    case "targets": {
      const targets = await listTargets(command.options);
      if (command.options.json) {
        io.log(JSON.stringify(targets, null, 2));
      } else if (!command.options.quiet) {
        io.log(renderTargets(targets));
      }
      return EXIT_CODES.success;
    }
    case "report": {
      const profile = await readProfile(command.options.profilePath);
      const findings = analyzeProfile(profile);
      const report = renderProfileMarkdown(profile, findings);

      if (command.options.markdown !== undefined) {
        await writeFile(command.options.markdown, report, "utf8");
      }

      if (command.options.json) {
        io.log(JSON.stringify({ source: profile.source, findings }, null, 2));
      } else if (!command.options.quiet) {
        io.log(report.trimEnd());
      }
      return EXIT_CODES.success;
    }
    case "compare": {
      const [baseline, candidate] = await Promise.all([
        readProfile(command.options.baselinePath),
        readProfile(command.options.candidatePath),
      ]);
      const result = compareProfiles({
        baseline,
        baselinePath: command.options.baselinePath,
        candidate,
        candidatePath: command.options.candidatePath,
      });
      const report = renderCompareMarkdown(result);

      if (command.options.markdown !== undefined) {
        await writeFile(command.options.markdown, report, "utf8");
      }

      if (command.options.json) {
        io.log(JSON.stringify(result, null, 2));
      } else if (!command.options.quiet) {
        io.log(report.trimEnd());
      }

      return result.verdict.material ? EXIT_CODES.materialDifferences : EXIT_CODES.success;
    }
    case "explain": {
      const input = await readJson(command.options.inputPath);
      const explanation = renderAgentExplanation(input);

      if (command.options.json) {
        io.log(JSON.stringify({ explanation: explanation.trimEnd() }, null, 2));
      } else if (!command.options.quiet) {
        io.log(explanation.trimEnd());
      }
      return EXIT_CODES.success;
    }
    case "guide":
    case "tui":
      return runGuide();
    default:
      return assertNever(command);
  }
}

function parseRun(flags: FlagValues): ParseResult {
  const unsupported = rejectUnsupportedFlags(flags, "run", RUN_FLAGS);
  if (unsupported !== undefined) {
    return unsupported;
  }

  const positionalError = rejectPositionals(flags, "run");
  if (positionalError !== undefined) {
    return positionalError;
  }
  const cdp = requiredValue(flags, "cdp");
  const out = requiredValue(flags, "out");
  if (!cdp.ok) return cdp;
  if (!out.ok) return out;

  const timeout = optionalPositiveInteger(flags, "timeout");
  if (!timeout.ok) return timeout;
  const target = optionalSingleValue(flags, "target");
  const targetUrl = optionalSingleValue(flags, "target-url");
  if (target !== undefined && targetUrl !== undefined) {
    return usageError("Use only one of --target or --target-url.");
  }
  if ((target !== undefined || targetUrl !== undefined) && (optionalSingleValue(flags, "diagnostic-bind") !== undefined || optionalSingleValue(flags, "diagnostic-host") !== undefined)) {
    return usageError("--diagnostic-bind and --diagnostic-host are only valid for fresh diagnostic-page runs.");
  }

  return {
    ok: true,
    command: {
      command: "run",
      options: {
        cdp: cdp.value,
        out: out.value,
        json: flagEnabled(flags, "json"),
        quiet: flagEnabled(flags, "quiet"),
        label: optionalSingleValue(flags, "label"),
        timeout: timeout.value,
        authHeaders: flags.values.get("auth-header") ?? [],
        diagnosticBind: optionalSingleValue(flags, "diagnostic-bind"),
        diagnosticHost: optionalSingleValue(flags, "diagnostic-host"),
        target,
        targetUrl,
      },
    },
  };
}

function parseTargets(flags: FlagValues): ParseResult {
  const unsupported = rejectUnsupportedFlags(flags, "targets", TARGETS_FLAGS);
  if (unsupported !== undefined) {
    return unsupported;
  }

  const positionalError = rejectPositionals(flags, "targets");
  if (positionalError !== undefined) {
    return positionalError;
  }
  const cdp = requiredValue(flags, "cdp");
  if (!cdp.ok) return cdp;

  const timeout = optionalPositiveInteger(flags, "timeout");
  if (!timeout.ok) return timeout;

  return {
    ok: true,
    command: {
      command: "targets",
      options: {
        cdp: cdp.value,
        json: flagEnabled(flags, "json"),
        quiet: flagEnabled(flags, "quiet"),
        timeout: timeout.value,
        authHeaders: flags.values.get("auth-header") ?? [],
      },
    },
  };
}

function parseReport(flags: FlagValues): ParseResult {
  const unsupported = rejectUnsupportedFlags(flags, "report", REPORT_FLAGS);
  if (unsupported !== undefined) {
    return unsupported;
  }

  const profilePath = onePositional(flags, "report", "profile.json");
  if (!profilePath.ok) return profilePath;

  return {
    ok: true,
    command: {
      command: "report",
      options: {
        profilePath: profilePath.value,
        markdown: optionalSingleValue(flags, "markdown"),
        json: flagEnabled(flags, "json"),
        quiet: flagEnabled(flags, "quiet"),
      },
    },
  };
}

function parseCompare(flags: FlagValues): ParseResult {
  const unsupported = rejectUnsupportedFlags(flags, "compare", COMPARE_FLAGS);
  if (unsupported !== undefined) {
    return unsupported;
  }

  if (flags.positionals.length !== 2) {
    return usageError("compare requires <baseline.json> and <candidate.json>.");
  }

  const [baselinePath, candidatePath] = flags.positionals;
  if (baselinePath === undefined || candidatePath === undefined) {
    return usageError("compare requires <baseline.json> and <candidate.json>.");
  }

  return {
    ok: true,
    command: {
      command: "compare",
      options: {
        baselinePath,
        candidatePath,
        markdown: optionalSingleValue(flags, "markdown"),
        json: flagEnabled(flags, "json"),
        quiet: flagEnabled(flags, "quiet"),
      },
    },
  };
}

function parseExplain(flags: FlagValues): ParseResult {
  const unsupported = rejectUnsupportedFlags(flags, "explain", EXPLAIN_FLAGS);
  if (unsupported !== undefined) {
    return unsupported;
  }

  const inputPath = onePositional(flags, "explain", "profile-or-compare.json");
  if (!inputPath.ok) return inputPath;

  return {
    ok: true,
    command: {
      command: "explain",
      options: {
        inputPath: inputPath.value,
        forAgent: flagEnabled(flags, "for-agent"),
        json: flagEnabled(flags, "json"),
        quiet: flagEnabled(flags, "quiet"),
      },
    },
  };
}

function parseGuide(flags: FlagValues, command: "guide" | "tui"): ParseResult {
  const unsupported = rejectUnsupportedFlags(flags, command, GUIDE_FLAGS);
  if (unsupported !== undefined) {
    return unsupported;
  }

  const positionalError = rejectPositionals(flags, command);
  if (positionalError !== undefined) {
    return positionalError;
  }

  return {
    ok: true,
    command: {
      command,
      options: {},
    },
  };
}

function collectFlags(args: string[]): { ok: true; parsed: FlagValues } | ParseError {
  const values = new Map<string, string[]>();
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }

    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }

    if (!arg.startsWith("--") && arg !== "-h") {
      return usageError(`Unknown short flag: ${arg}`);
    }

    const normalized = arg === "-h" ? "--help" : arg;
    const body = normalized.slice(2);
    const eqIndex = body.indexOf("=");
    const rawName = eqIndex === -1 ? body : body.slice(0, eqIndex);
    const inlineValue = eqIndex === -1 ? undefined : body.slice(eqIndex + 1);
    if (rawName.length === 0) {
      return usageError(`Invalid flag: ${arg}`);
    }
    const spec = FLAG_SPEC[rawName];
    if (spec === undefined) {
      return usageError(`Unknown flag: --${rawName}`);
    }

    let bucket = values.get(rawName);
    if (bucket === undefined) {
      bucket = [];
      values.set(rawName, bucket);
    }

    if (!spec.takesValue) {
      bucket.push("true");
      continue;
    }

    const value = inlineValue ?? args[index + 1];
    if (value === undefined || value === "" || value.startsWith("-")) {
      return usageError(`Flag --${rawName} requires a value.`);
    }

    bucket.push(value);
    if (inlineValue === undefined) {
      index += 1;
    }
  }

  return { ok: true, parsed: { values, positionals } };
}

function flagEnabled(flags: FlagValues, name: string): boolean {
  return flags.values.has(name);
}

function rejectUnsupportedFlags(flags: FlagValues, command: CommandName, allowed: Set<string>): ParseError | undefined {
  for (const name of flags.values.keys()) {
    if (!allowed.has(name)) {
      return usageError(`Flag --${name} is not valid for ${command}.`);
    }
  }
  return undefined;
}

function requiredValue(flags: FlagValues, name: string): { ok: true; value: string } | ParseError {
  const value = optionalSingleValue(flags, name);
  if (value === undefined) {
    return usageError(`Missing required flag --${name}.`);
  }
  return { ok: true, value };
}

function optionalSingleValue(flags: FlagValues, name: string): string | undefined {
  const values = flags.values.get(name);
  if (values === undefined) {
    return undefined;
  }
  return values.at(-1);
}

function optionalPositiveInteger(flags: FlagValues, name: string): { ok: true; value: number | undefined } | ParseError {
  const value = optionalSingleValue(flags, name);
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || String(parsed) !== value) {
    return usageError(`Flag --${name} must be a positive integer.`);
  }

  return { ok: true, value: parsed };
}

function onePositional(flags: FlagValues, command: string, name: string): { ok: true; value: string } | ParseError {
  if (flags.positionals.length !== 1) {
    return usageError(`${command} requires <${name}>.`);
  }

  const value = flags.positionals[0];
  if (value === undefined) {
    return usageError(`${command} requires <${name}>.`);
  }

  return { ok: true, value };
}

function rejectPositionals(flags: FlagValues, command: string): ParseError | undefined {
  if (flags.positionals.length > 0) {
    return usageError(`${command} does not accept positional arguments.`);
  }
  return undefined;
}

function usageError(message: string): ParseError {
  return {
    ok: false,
    exitCode: EXIT_CODES.usage,
    message,
  };
}

function renderTargets(targets: Awaited<ReturnType<typeof listTargets>>): string {
  if (targets.length === 0) {
    return "No page targets found.";
  }

  return targets
    .map((target) => {
      const title = target.title.length > 0 ? target.title : "(untitled)";
      const url = target.url.length > 0 ? target.url : "about:blank";
      const attached = target.attached ? " attached" : "";
      return `${target.targetId}\t${target.type}${attached}\t${title}\t${url}`;
    })
    .join("\n");
}

async function readJson(path: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BotprintError(`Could not read input ${path}: ${message}`, EXIT_CODES.usage);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BotprintError(`Input is not valid JSON: ${message}`, EXIT_CODES.schemaValidation);
  }
}

function isCommand(value: string): value is CommandName {
  return COMMANDS.has(value as CommandName);
}

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

if (import.meta.main) {
  const exitCode = await runCli(Bun.argv.slice(2));
  process.exit(exitCode);
}
