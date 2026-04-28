import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chromePath = process.env.BOTPRINT_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const portRaw = process.env.BOTPRINT_SMOKE_PORT ?? "9223";
if (!/^[1-9]\d*$/.test(portRaw)) {
  throw new Error("BOTPRINT_SMOKE_PORT must be a positive integer.");
}
const port = Number(portRaw);
if (port > 65535) {
  throw new Error("BOTPRINT_SMOKE_PORT must be between 1 and 65535.");
}

if (!(await Bun.file(chromePath).exists())) {
  throw new Error(`Chrome not found at ${chromePath}. Set BOTPRINT_CHROME to your Chrome or Chromium binary.`);
}

const binaryPath = join(import.meta.dir, "..", "dist", "botprint");
const workDir = await mkdtemp(join(tmpdir(), "botprint-smoke-"));
const sourceProfile = join(workDir, "source.profile.json");
const binaryProfile = join(workDir, "binary.profile.json");
let chrome: Bun.Subprocess | undefined;
let cleaned = false;

async function cleanup(): Promise<void> {
  if (cleaned) return;
  cleaned = true;
  if (chrome !== undefined) {
    chrome.kill();
    const killTimer = setTimeout(() => chrome?.kill("SIGKILL"), 2000);
    await chrome.exited.catch(() => undefined);
    clearTimeout(killTimer);
  }
  if (process.env.BOTPRINT_KEEP_SMOKE_ARTIFACTS !== "1") {
    await rm(workDir, { recursive: true, force: true });
  }
}

const onSignal = (): void => {
  cleanup().finally(() => process.exit(130));
};
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);

try {
  await run("bun", ["run", "build"]);

  chrome = Bun.spawn(
    [
      chromePath,
      "--headless=new",
      "--disable-gpu",
      `--remote-debugging-port=${String(port)}`,
      `--user-data-dir=${join(workDir, "chrome-profile")}`,
      "about:blank",
    ],
    {
      stdout: "ignore",
      stderr: "ignore",
    },
  );

  await waitForCdp(port);

  const cdp = `http://127.0.0.1:${String(port)}`;
  await run("bun", ["run", "src/cli.ts", "run", "--cdp", cdp, "--out", sourceProfile, "--label", "smoke-source"]);
  await run(binaryPath, ["run", "--cdp", cdp, "--out", binaryProfile, "--label", "smoke-binary"]);
  await run("bun", ["run", "src/cli.ts", "compare", sourceProfile, binaryProfile, "--quiet"]);

  const binaryStats = await Bun.file(binaryPath).stat();
  const artifactNote = process.env.BOTPRINT_KEEP_SMOKE_ARTIFACTS === "1" ? ` Artifacts: ${workDir}.` : "";
  console.log(`Smoke passed. Binary: ${binaryPath} (${formatBytes(binaryStats.size)}).${artifactNote}`);
} finally {
  await cleanup();
}

async function run(command: string, args: string[]): Promise<void> {
  const proc = Bun.spawn([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

  if (stdout.length > 0) process.stdout.write(stdout);
  if (stderr.length > 0) process.stderr.write(stderr);

  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${String(exitCode)}.`);
  }
}

async function waitForCdp(cdpPort: number): Promise<void> {
  const url = `http://127.0.0.1:${String(cdpPort)}/json/version`;
  const deadline = Date.now() + 10_000;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `${String(response.status)} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await Bun.sleep(100);
  }

  throw new Error(`Chrome did not expose CDP at ${url}: ${lastError}`);
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
