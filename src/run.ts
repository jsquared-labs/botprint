import { discoverWebSocketUrl, connectCdp, getBrowserVersion, getTargets, type CdpClient, type CdpTarget } from "./cdp";
import { EXIT_CODES } from "./exit-codes";
import { BotprintError } from "./errors";
import { endpointKind, SCHEMA_VERSION, type BotprintProfile, writeProfile } from "./profile";
import { runDiagnosticProbe, runExistingTargetProbe, type ProbeRunResult } from "./probe";
import { BOTPRINT_VERSION } from "./version";

export type RunOptions = {
  cdp: string;
  out: string;
  label: string | undefined;
  timeout: number | undefined;
  authHeaders: string[];
  diagnosticBind: string | undefined;
  diagnosticHost: string | undefined;
  target: string | undefined;
  targetUrl: string | undefined;
};

export type TargetListOptions = {
  cdp: string;
  timeout: number | undefined;
  authHeaders: string[];
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_DIAGNOSTIC_BIND = "127.0.0.1";

export async function listTargets(options: TargetListOptions): Promise<CdpTarget[]> {
  const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const headers = parseHeaderLines(options.authHeaders);
  const webSocketUrl = await discoverWebSocketUrl(options.cdp, headers);
  const client = await connectCdp(webSocketUrl, headers, timeoutMs);

  try {
    return (await getTargets(client)).filter((target) => target.type === "page");
  } finally {
    client.close();
  }
}

export async function runProfile(options: RunOptions): Promise<MinimalProfile> {
  const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const headers = parseHeaderLines(options.authHeaders);
  const webSocketUrl = await discoverWebSocketUrl(options.cdp, headers);
  const client = await connectCdp(webSocketUrl, headers, timeoutMs);

  try {
    if (options.target !== undefined || options.targetUrl !== undefined) {
      return await runExistingTargetProfile(client, options);
    }

    const server = startDiagnosticServer(options.diagnosticBind ?? DEFAULT_DIAGNOSTIC_BIND);
    try {
      const diagnosticUrl = browserDiagnosticUrl(server.url, options.diagnosticHost);
      const browserVersion = await getBrowserVersion(client);
      const probe = await runDiagnosticProbe(client, browserVersion, diagnosticUrl);

      const profile = buildProfile(options, browserVersion, probe, {
        probe_context: "local-diagnostic-page",
        target_url: probe.targetUrl,
      });

      if (options.label !== undefined) {
        profile.source.label = options.label;
      }

      await writeProfile(options.out, profile);
      return profile;
    } finally {
      server.stop(true);
    }
  } finally {
    client.close();
  }
}

type MinimalProfile = BotprintProfile;

async function runExistingTargetProfile(client: CdpClient, options: RunOptions): Promise<MinimalProfile> {
  const targets = await getTargets(client);
  const target = selectTarget(targets, options);
  const browserVersion = await getBrowserVersion(client);
  const probe = await runExistingTargetProbe(client, browserVersion, target.targetId);
  const profile = buildProfile(options, browserVersion, probe, {
    probe_context: "existing-target",
    target_url: probe.targetUrl || target.url,
    target_id: target.targetId,
    target_type: target.type,
    probe_warnings: ["page-contamination-possible"],
  });

  if (options.label !== undefined) {
    profile.source.label = options.label;
  }

  await writeProfile(options.out, profile);
  return profile;
}

function buildProfile(
  options: RunOptions,
  browserVersion: Awaited<ReturnType<typeof getBrowserVersion>>,
  probe: ProbeRunResult,
  source: Pick<BotprintProfile["source"], "probe_context" | "target_url"> &
    Partial<Pick<BotprintProfile["source"], "target_id" | "target_type" | "probe_warnings">>,
): BotprintProfile {
  return {
    schema_version: SCHEMA_VERSION,
    botprint_version: BOTPRINT_VERSION,
    created_at: new Date().toISOString(),
    source: {
      cdp_endpoint_kind: endpointKind(options.cdp),
      browser_version: browserVersion.product,
      ...source,
    },
    signals: {
      identity: {
        user_agent: probe.result.userAgent,
        platform: probe.result.platform,
        languages: probe.result.languages,
        plugins_count: probe.result.pluginsCount,
        mime_types_count: probe.result.mimeTypesCount,
      },
      automation: {
        webdriver: probe.result.webdriver,
        globals: probe.result.automationGlobals,
      },
      environment: {
        timezone: probe.result.timezone,
        viewport: {
          width: probe.result.viewport.width,
          height: probe.result.viewport.height,
          device_scale_factor: probe.result.viewport.deviceScaleFactor,
        },
        screen: {
          width: probe.result.screen.width,
          height: probe.result.screen.height,
          avail_width: probe.result.screen.availWidth,
          avail_height: probe.result.screen.availHeight,
        },
        hardware_concurrency: probe.result.hardwareConcurrency,
        device_memory: probe.result.deviceMemory,
      },
      rendering: {
        webgl: {
          status: availability(probe.result.rendering.webgl.status),
          vendor: optionalString(probe.result.rendering.webgl.vendor),
          renderer: optionalString(probe.result.rendering.webgl.renderer),
          unmasked_vendor: optionalString(probe.result.rendering.webgl.unmaskedVendor),
          unmasked_renderer: optionalString(probe.result.rendering.webgl.unmaskedRenderer),
        },
        canvas: {
          status: canvasStatus(probe.result.rendering.canvas.status),
          hash: optionalString(probe.result.rendering.canvas.hash),
        },
      },
      storage: {
        cookies_enabled: probe.result.cookiesEnabled,
        local_storage: availability(probe.result.storage.localStorage),
        session_storage: availability(probe.result.storage.sessionStorage),
        indexed_db: availability(probe.result.storage.indexedDb),
        service_worker: availability(probe.result.storage.serviceWorker),
      },
      permissions: normalizePermissions(probe.result.permissions),
      webrtc: {
        api_available: probe.result.webrtc.apiAvailable,
        host_candidate_gathering: webrtcStatus(probe.result.webrtc.hostCandidateGathering),
        candidate_count: probe.result.webrtc.candidateCount,
      },
      cdp: {
        product: browserVersion.product,
        protocol_version: browserVersion.protocolVersion,
        user_agent: browserVersion.userAgent,
      },
    },
    findings: [],
  };
}

export function selectTarget(targets: CdpTarget[], options: Pick<RunOptions, "target" | "targetUrl">): CdpTarget {
  if (options.target !== undefined) {
    const target = targets.find((candidate) => candidate.targetId === options.target);
    if (target === undefined) {
      throw new BotprintError(`No CDP page target found with targetId ${options.target}.`, EXIT_CODES.usage);
    }
    if (target.type !== "page") {
      throw new BotprintError(`Target ${options.target} has type ${target.type}; only page targets are supported.`, EXIT_CODES.usage);
    }
    return target;
  }

  const targetUrl = options.targetUrl;
  if (targetUrl === undefined) {
    throw new BotprintError("Existing-target run requires --target or --target-url.", EXIT_CODES.usage);
  }

  const matches = targets.filter((target) => target.type === "page" && target.url.startsWith(targetUrl));
  if (matches.length === 1) {
    const match = matches[0];
    if (match !== undefined) {
      return match;
    }
  }

  const matchList = matches.length === 0 ? "no matches" : matches.map((target) => `${target.targetId} ${target.url}`).join("; ");
  throw new BotprintError(`--target-url ${targetUrl} must resolve to exactly one page target; found ${matches.length}: ${matchList}`, EXIT_CODES.usage);
}

export function parseHeaderLines(lines: string[]): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      throw new BotprintError(`Invalid --auth-header value: ${line}`, EXIT_CODES.usage);
    }

    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (name.length === 0 || value.length === 0) {
      throw new BotprintError(`Invalid --auth-header value: ${line}`, EXIT_CODES.usage);
    }

    headers[name] = value;
  }

  return headers;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function availability(value: unknown): "available" | "unavailable" | "error" {
  return value === "available" || value === "unavailable" || value === "error" ? value : "error";
}

function canvasStatus(value: unknown): "stable" | "unstable" | "unavailable" | "error" {
  return value === "stable" || value === "unstable" || value === "unavailable" || value === "error" ? value : "error";
}

function webrtcStatus(value: unknown): "present" | "absent" | "unsupported" | "error" {
  return value === "present" || value === "absent" || value === "unsupported" || value === "error" ? value : "error";
}

function normalizePermissions(values: Record<string, string>): Record<string, "granted" | "denied" | "prompt" | "unsupported" | "error" | "unknown"> {
  const out: Record<string, "granted" | "denied" | "prompt" | "unsupported" | "error" | "unknown"> = {};

  for (const [key, value] of Object.entries(values)) {
    if (value === "granted" || value === "denied" || value === "prompt" || value === "unsupported" || value === "error") {
      out[key] = value;
    } else {
      out[key] = "unknown";
    }
  }

  return out;
}

export function browserDiagnosticUrl(serverUrl: URL, diagnosticHost: string | undefined): string {
  if (diagnosticHost === undefined) {
    return serverUrl.href;
  }

  const url = new URL(serverUrl.href);
  url.hostname = diagnosticHost;
  return url.href;
}

function startDiagnosticServer(hostname: string): { url: URL; stop(force?: boolean): void } {
  try {
    return Bun.serve({
      hostname,
      port: 0,
      fetch() {
        return new Response("<!doctype html><title>Botprint diagnostic page</title>", {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new BotprintError(`Failed to bind diagnostic server to ${hostname}: ${detail}`, EXIT_CODES.usage);
  }
}
