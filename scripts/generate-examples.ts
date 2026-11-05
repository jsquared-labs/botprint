import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compareProfiles } from "../src/compare";
import { analyzeProfile } from "../src/findings";
import { SCHEMA_VERSION, type BotprintProfile, validateProfile } from "../src/profile";
import { renderAgentExplanation, renderCompareMarkdown, renderProfileMarkdown } from "../src/render";
import { BOTPRINT_VERSION } from "../src/version";

const OUT_DIR = process.env.BOTPRINT_EXAMPLES_OUT_DIR ?? join(import.meta.dir, "..", "examples", "synthetic");
const CREATED_AT = "2026-04-28T00:00:00.000Z";

const local = profile({
  label: "synthetic-local",
  browserVersion: "Chrome/147.0.0.0",
  targetUrl: "http://127.0.0.1:45001/",
  timezone: "America/New_York",
  viewport: { width: 1440, height: 900, device_scale_factor: 2 },
  outerWindow: { width: 1440, height: 980 },
  screen: { width: 1440, height: 900, avail_width: 1440, avail_height: 875, color_depth: 30 },
  hardwareConcurrency: 8,
  deviceMemory: 8,
  webglRenderer: "ANGLE Metal Renderer: Synthetic GPU",
  canvasHash: "synthetic-local-canvas",
  fonts: ["Arial", "Courier New", "Georgia", "Helvetica", "Helvetica Neue", "Menlo", "Monaco", "Times New Roman", "Verdana"],
  acceptLanguage: "en-US,en;q=0.9",
});

const docker = profile({
  label: "synthetic-docker",
  browserVersion: "HeadlessChrome/145.0.0.0",
  targetUrl: "http://host.docker.internal:45002/",
  timezone: "UTC",
  viewport: { width: 1280, height: 720, device_scale_factor: 1 },
  outerWindow: { width: 0, height: 0 },
  screen: { width: 1280, height: 720, avail_width: 1280, avail_height: 720, color_depth: 24 },
  hardwareConcurrency: 4,
  deviceMemory: null,
  webglRenderer: "SwiftShader Device (Synthetic)",
  canvasHash: "synthetic-docker-canvas",
  fonts: [],
  acceptLanguage: undefined,
  pluginsCount: 0,
  chromeObject: false,
  notificationApi: "denied",
  storage: {
    cookies_enabled: true,
    local_storage: "available",
    session_storage: "available",
    indexed_db: "error",
    service_worker: "unavailable",
  },
  permissions: {
    geolocation: "denied",
    notifications: "denied",
    camera: "denied",
    microphone: "denied",
  },
  cdpProduct: "HeadlessChrome/145.0.0.0",
});

const existingTarget = profile({
  label: "synthetic-site-target",
  browserVersion: "Chrome/147.0.0.0",
  targetUrl: "https://app.example.test/dashboard",
  probeContext: "existing-target",
  targetId: "SYNTHETIC_TARGET_1",
  targetType: "page",
  probeWarnings: ["page-contamination-possible"],
  timezone: "America/New_York",
  viewport: { width: 1440, height: 900, device_scale_factor: 2 },
  outerWindow: { width: 1440, height: 980 },
  screen: { width: 1440, height: 900, avail_width: 1440, avail_height: 875, color_depth: 30 },
  hardwareConcurrency: 8,
  deviceMemory: 8,
  webglRenderer: "ANGLE Metal Renderer: Synthetic GPU",
  canvasHash: "synthetic-site-canvas",
  fonts: ["Arial", "Courier New", "Georgia", "Helvetica", "Helvetica Neue", "Menlo", "Monaco", "Times New Roman", "Verdana"],
  acceptLanguage: "en-US,en;q=0.9",
  storage: {
    cookies_enabled: true,
    local_storage: "error",
    session_storage: "error",
    indexed_db: "error",
    service_worker: "available",
  },
  permissions: {
    geolocation: "denied",
    notifications: "denied",
    camera: "denied",
    microphone: "denied",
  },
});

await mkdir(OUT_DIR, { recursive: true });

await writeProfile("local.profile.json", local);
await writeProfile("docker.profile.json", docker);
await writeProfile("site-target.profile.json", existingTarget);

await writeText("local.report.md", renderProfileMarkdown(local, analyzeProfile(local)));
await writeText("docker.report.md", renderProfileMarkdown(docker, analyzeProfile(docker)));
await writeText("site-target.report.md", renderProfileMarkdown(existingTarget, analyzeProfile(existingTarget)));

const localVsDocker = deterministicCompare({
  baseline: local,
  baselinePath: "examples/synthetic/local.profile.json",
  candidate: docker,
  candidatePath: "examples/synthetic/docker.profile.json",
});
await writeText("local-vs-docker.compare.json", `${JSON.stringify(localVsDocker, null, 2)}\n`);
await writeText("local-vs-docker.compare.md", renderCompareMarkdown(localVsDocker));
await writeText("local-vs-docker.agent.md", renderAgentExplanation(localVsDocker));

const localVsTarget = deterministicCompare({
  baseline: local,
  baselinePath: "examples/synthetic/local.profile.json",
  candidate: existingTarget,
  candidatePath: "examples/synthetic/site-target.profile.json",
});
await writeText("local-vs-site-target.compare.json", `${JSON.stringify(localVsTarget, null, 2)}\n`);
await writeText("local-vs-site-target.compare.md", renderCompareMarkdown(localVsTarget));
await writeText("local-vs-site-target.agent.md", renderAgentExplanation(localVsTarget));

await writeText(
  "README.md",
  `# Synthetic Botprint Examples

These fixtures are generated with \`bun run examples:generate\`. They are deterministic, schema-valid, and intentionally synthetic. They do not contain real browser profile data from a developer machine.

## Files

- \`local.profile.json\`: clean local diagnostic-page profile.
- \`docker.profile.json\`: synthetic Docker/headless-style candidate with storage, rendering, and environment differences.
- \`site-target.profile.json\`: synthetic existing-target profile with \`page-contamination-possible\` measurement notes.
- \`*.report.md\`: bounded profile reports generated from the profiles.
- \`*.compare.json\`: compare artifacts generated from profile pairs.
- \`*.compare.md\`: Markdown compare reports.
- \`*.agent.md\`: compact agent explanations from compare JSON.

These examples exist for understanding Botprint output and testing parsers.
`,
);

console.log(`Generated synthetic examples in ${OUT_DIR}`);

type ProfileInput = {
  label: string;
  browserVersion: string;
  targetUrl: string;
  timezone: string;
  viewport: BotprintProfile["signals"]["environment"]["viewport"];
  outerWindow: BotprintProfile["signals"]["environment"]["outer_window"];
  screen: BotprintProfile["signals"]["environment"]["screen"];
  hardwareConcurrency: number;
  deviceMemory: number | null;
  webglRenderer: string;
  canvasHash: string;
  fonts: string[];
  acceptLanguage: string | undefined;
  pluginsCount?: number;
  chromeObject?: boolean;
  notificationApi?: BotprintProfile["signals"]["permissions"][string];
  cdpProduct?: string;
  probeContext?: BotprintProfile["source"]["probe_context"];
  targetId?: string;
  targetType?: string;
  probeWarnings?: BotprintProfile["source"]["probe_warnings"];
  storage?: BotprintProfile["signals"]["storage"];
  permissions?: BotprintProfile["signals"]["permissions"];
};

type CompareInput = Parameters<typeof compareProfiles>[0];
type CompareResult = ReturnType<typeof compareProfiles>;

function deterministicCompare(input: CompareInput): CompareResult {
  return {
    ...compareProfiles(input),
    created_at: CREATED_AT,
  };
}

function profile(input: ProfileInput): BotprintProfile {
  const probeContext = input.probeContext ?? "local-diagnostic-page";
  const family = input.browserVersion.split("/")[0] ?? "Chrome";
  const version = input.browserVersion.split("/")[1] ?? "147.0.0.0";
  const major = version.split(".")[0] ?? "147";
  const userAgent = `Mozilla/5.0 (Synthetic) AppleWebKit/537.36 (KHTML, like Gecko) ${family}/${version} Safari/537.36`;
  const requestHeaders: Record<string, string> = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-encoding": "gzip, deflate, br, zstd",
    "sec-ch-ua": `"${family}";v="${major}", "Chromium";v="${major}", "Not_A Brand";v="8"`,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Synthetic"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "upgrade-insecure-requests": "1",
    "user-agent": userAgent,
  };
  if (input.acceptLanguage !== undefined) {
    requestHeaders["accept-language"] = input.acceptLanguage;
  }
  const draft = validateProfile({
    schema_version: SCHEMA_VERSION,
    botprint_version: BOTPRINT_VERSION,
    created_at: CREATED_AT,
    source: {
      label: input.label,
      cdp_endpoint_kind: "http",
      browser_version: input.browserVersion,
      target_url: input.targetUrl,
      probe_context: probeContext,
      browser_context_id: "SYNTHETIC_CONTEXT_1",
      browser_context_source: probeContext === "local-diagnostic-page" ? "page-target" : undefined,
      target_id: input.targetId,
      target_type: input.targetType,
      probe_timeout_ms: 2000,
      probe_warnings: input.probeWarnings,
    },
    signals: {
      identity: {
        user_agent: userAgent,
        user_agent_data: {
          brands: [
            { brand: family, version: major },
            { brand: "Chromium", version: major },
            { brand: "Not_A Brand", version: "8" },
          ],
          mobile: false,
          platform: "Synthetic",
        },
        platform: "SyntheticPlatform",
        language: "en-US",
        languages: ["en-US", "en"],
        plugins_count: input.pluginsCount ?? 3,
        mime_types_count: input.pluginsCount === 0 ? 0 : 2,
        pdf_viewer_enabled: (input.pluginsCount ?? 3) > 0,
      },
      automation: {
        webdriver: false,
        chrome_object: input.chromeObject ?? true,
        globals: {
          "cdc_*": false,
          "__webdriver_*": false,
          "$cdc_asdjflasutopfhvcZLmcfl_": false,
          "_phantom": false,
          "__nightmare": false,
          "domAutomation": false,
          "domAutomationController": false,
        },
      },
      environment: {
        timezone: input.timezone,
        viewport: input.viewport,
        outer_window: input.outerWindow,
        screen: input.screen,
        hardware_concurrency: input.hardwareConcurrency,
        device_memory: input.deviceMemory,
        speech_voices_count: input.fonts.length > 0 ? 12 : 0,
      },
      rendering: {
        webgl: {
          status: "available",
          vendor: "WebKit",
          renderer: "WebKit WebGL",
          unmasked_vendor: "Synthetic Vendor",
          unmasked_renderer: input.webglRenderer,
        },
        canvas: {
          status: "stable",
          hash: input.canvasHash,
        },
        audio: {
          status: "available",
          hash: `${input.canvasHash}-audio`,
        },
        fonts: {
          status: "available",
          checked: 31,
          detected: input.fonts,
        },
      },
      storage: input.storage ?? {
        cookies_enabled: true,
        local_storage: "available",
        session_storage: "available",
        indexed_db: "available",
        service_worker: "available",
      },
      permissions: {
        ...(input.permissions ?? {
          geolocation: "prompt",
          notifications: "prompt",
          camera: "prompt",
          microphone: "prompt",
        }),
        notification_api: input.notificationApi ?? "prompt",
      },
      webrtc: {
        api_available: true,
        host_candidate_gathering: "absent",
        candidate_count: 0,
      },
      http: probeContext === "local-diagnostic-page" ? { status: "captured", request_headers: requestHeaders } : undefined,
      cdp: {
        product: input.cdpProduct ?? input.browserVersion,
        protocol_version: "1.3",
        user_agent: userAgent,
      },
    },
    findings: [],
  });
  draft.findings = analyzeProfile(draft);
  return draft;
}

async function writeProfile(name: string, value: BotprintProfile): Promise<void> {
  await writeText(name, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(name: string, value: string): Promise<void> {
  await writeFile(join(OUT_DIR, name), value, "utf8");
}
