import { createInterface, type Interface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { EXIT_CODES, type ExitCode } from "./exit-codes";
import { runCli } from "./cli";

type Choice = {
  key: string;
  label: string;
  run: (rl: Interface) => Promise<ExitCode>;
};

const CHOICES: Choice[] = [
  {
    key: "1",
    label: "Collect a fresh diagnostic-page profile",
    run: collectFreshProfile,
  },
  {
    key: "2",
    label: "List existing page targets",
    run: listExistingTargets,
  },
  {
    key: "3",
    label: "Collect an existing-target profile",
    run: collectExistingTargetProfile,
  },
  {
    key: "4",
    label: "Compare two profiles",
    run: compareProfilesFlow,
  },
  {
    key: "5",
    label: "Generate a Markdown report",
    run: generateReport,
  },
  {
    key: "6",
    label: "Generate an agent explanation",
    run: explainForAgent,
  },
];

export async function runGuide(): Promise<ExitCode> {
  const rl = createInterface({ input, output });
  try {
    output.write("Botprint guide\n\n");
    for (const choice of CHOICES) {
      output.write(`${choice.key}. ${choice.label}\n`);
    }
    output.write("\n");

    const selected = await askRequired(rl, "Choose an action");
    const choice = CHOICES.find((candidate) => candidate.key === selected);
    if (choice === undefined) {
      output.write(`Unknown action: ${selected}\n`);
      return EXIT_CODES.usage;
    }

    output.write(`\n${choice.label}\n`);
    return await choice.run(rl);
  } finally {
    rl.close();
  }
}

async function collectFreshProfile(rl: Interface): Promise<ExitCode> {
  const cdp = await askDefault(rl, "CDP endpoint", "http://127.0.0.1:9222");
  const out = await askDefault(rl, "Output profile path", "profiles/local.profile.json");
  const label = await askOptional(rl, "Label");
  const args = ["run", "--cdp", cdp, "--out", out];
  appendOptionalFlag(args, "--label", label);
  return runGuideCommand(args);
}

async function listExistingTargets(rl: Interface): Promise<ExitCode> {
  const cdp = await askDefault(rl, "CDP endpoint", "http://127.0.0.1:9222");
  return runGuideCommand(["targets", "--cdp", cdp]);
}

async function collectExistingTargetProfile(rl: Interface): Promise<ExitCode> {
  const cdp = await askDefault(rl, "CDP endpoint", "http://127.0.0.1:9222");
  const selectorKind = await askDefault(rl, "Select by target id or url prefix", "id");
  const out = await askDefault(rl, "Output profile path", "profiles/site.profile.json");
  const label = await askOptional(rl, "Label");
  const args = ["run", "--cdp", cdp, "--out", out];

  if (selectorKind.toLowerCase().startsWith("url")) {
    args.push("--target-url", await askRequired(rl, "Target URL prefix"));
  } else {
    args.push("--target", await askRequired(rl, "Target ID"));
  }

  appendOptionalFlag(args, "--label", label);
  return runGuideCommand(args);
}

async function compareProfilesFlow(rl: Interface): Promise<ExitCode> {
  const baseline = await askRequired(rl, "Baseline profile path");
  const candidate = await askRequired(rl, "Candidate profile path");
  const markdown = await askOptional(rl, "Markdown output path");
  const args = ["compare", baseline, candidate];
  appendOptionalFlag(args, "--markdown", markdown);
  return runGuideCommand(args);
}

async function generateReport(rl: Interface): Promise<ExitCode> {
  const profile = await askRequired(rl, "Profile path");
  const markdown = await askDefault(rl, "Markdown output path", profile.replace(/\.json$/u, ".report.md"));
  return runGuideCommand(["report", profile, "--markdown", markdown, "--quiet"]);
}

async function explainForAgent(rl: Interface): Promise<ExitCode> {
  const inputPath = await askRequired(rl, "Profile or compare JSON path");
  return runGuideCommand(["explain", inputPath, "--for-agent"]);
}

async function askRequired(rl: Interface, label: string): Promise<string> {
  while (true) {
    const value = (await rl.question(`${label}: `)).trim();
    if (value.length > 0) return value;
  }
}

async function askOptional(rl: Interface, label: string): Promise<string | undefined> {
  const value = (await rl.question(`${label} (optional): `)).trim();
  return value.length > 0 ? value : undefined;
}

async function askDefault(rl: Interface, label: string, defaultValue: string): Promise<string> {
  const value = (await rl.question(`${label} [${defaultValue}]: `)).trim();
  return value.length > 0 ? value : defaultValue;
}

function appendOptionalFlag(args: string[], flag: string, value: string | undefined): void {
  if (value !== undefined) {
    args.push(flag, value);
  }
}

function runGuideCommand(args: string[]): Promise<ExitCode> {
  output.write(`\nRunning: botprint ${args.map(shellQuote).join(" ")}\n\n`);
  return runCli(args);
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/u.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}
