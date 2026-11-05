import { discoverWebSocketUrl, connectCdp, getBrowserVersion, getTargets, type CdpClient, type CdpTarget } from "./cdp";
import { EXIT_CODES } from "./exit-codes";
import { BotprintError, errorDetail } from "./errors";
import { analyzeProfile } from "./findings";
import { endpointKind, SCHEMA_VERSION, type BotprintProfile, type ProbeWarning, writeProfile } from "./profile";
import { DEFAULT_PROBE_TIMEOUT_MS, runDiagnosticProbe, runExistingTargetProbe, type ProbeRunResult } from "./probe";
import { BOTPRINT_VERSION } from "./version";

export type RunOptions = {
  cdp: string;
  out: string;
  label: string | undefined;
  timeout: number | undefined;
  probeTimeout: number | undefined;
  authHeaders: string[];
  diagnosticBind: string | undefined;
  diagnosticHost: string | undefined;
  context: string | undefined;
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

// Request headers recorded from the browser's fetch of the diagnostic page. Allowlisted so
// profiles never carry cookies, authorization, or proxy headers.
export const CAPTURED_REQUEST_HEADERS = [
  "accept",
  "accept-encoding",
  "accept-language",
  "dnt",
  "priority",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-user",
  "sec-gpc",
  "upgrade-insecure-requests",
  "user-agent",
] as const;

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

export async function runProfile(options: RunOptions): Promise<BotprintProfile> {
  const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const headers = parseHeaderLines(options.authHeaders);
  const webSocketUrl = await discoverWebSocketUrl(options.cdp, headers);
  const client = await connectCdp(webSocketUrl, headers, timeoutMs);

  try {
    if (options.target !== undefined || options.targetUrl !== undefined) {
      return await runExistingTargetProfile(client, options);
    }
    return await runFreshPageProfile(client, options);
  } finally {
    client.close();
  }
}

async function runFreshPageProfile(client: CdpClient, options: RunOptions): Promise<BotprintProfile> {
  const probeTimeoutMs = options.probeTimeout ?? DEFAULT_PROBE_TIMEOUT_MS;
  const server = startDiagnosticServer(options.diagnosticBind ?? DEFAULT_DIAGNOSTIC_BIND);
  try {
    const diagnosticUrl = browserDiagnosticUrl(server.url, options.diagnosticHost);
    const browserVersion = await getBrowserVersion(client);
    const context = selectBrowserContext(await getTargets(client), options.context);
    let probe: ProbeRunResult;
    try {
      probe = await runDiagnosticProbe(client, browserVersion, diagnosticUrl, {
        timeoutMs: probeTimeoutMs,
        browserContextId: context.browserContextId,
      });
    } catch (error) {
      throw rejectedContextError(error, context) ?? error;
    }

    const captured = server.capturedHeaders();
    const warnings: ProbeWarning[] = [...context.warnings];
    if (captured === undefined) {
      warnings.push("http-not-captured");
    }

    const profile = buildProfile(options, browserVersion, probe, {
      probe_context: "local-diagnostic-page",
      target_url: probe.targetUrl,
      browser_context_id: context.browserContextId,
      browser_context_source: context.source,
      probe_timeout_ms: probeTimeoutMs,
      probe_warnings: warnings.length > 0 ? warnings : undefined,
    });
    profile.signals.http = captured === undefined ? { status: "not-captured", request_headers: {} } : { status: "captured", request_headers: captured };

    return await finalizeProfile(options, profile);
  } finally {
    server.stop(true);
  }
}

async function runExistingTargetProfile(client: CdpClient, options: RunOptions): Promise<BotprintProfile> {
  const probeTimeoutMs = options.probeTimeout ?? DEFAULT_PROBE_TIMEOUT_MS;
  const targets = await getTargets(client);
  const target = selectTarget(targets, options);
  const browserVersion = await getBrowserVersion(client);
  const probe = await runExistingTargetProbe(client, browserVersion, target.targetId, { timeoutMs: probeTimeoutMs });
  const profile = buildProfile(options, browserVersion, probe, {
    probe_context: "existing-target",
    target_url: probe.targetUrl || target.url,
    browser_context_id: target.browserContextId,
    target_id: target.targetId,
    target_type: target.type,
    probe_timeout_ms: probeTimeoutMs,
    probe_warnings: ["page-contamination-possible"],
  });

  return finalizeProfile(options, profile);
}

async function finalizeProfile(options: RunOptions, profile: BotprintProfile): Promise<BotprintProfile> {
  if (options.label !== undefined) {
    profile.source.label = options.label;
  }
  profile.findings = analyzeProfile(profile);
  await writeProfile(options.out, profile);
  return profile;
}

export type BrowserContextSelection = {
  browserContextId: string | undefined;
  source: NonNullable<BotprintProfile["source"]["browser_context_source"]>;
  warnings: ProbeWarning[];
};

// Fresh diagnostic pages are created inside the browser context of an existing page target so
// that context-level configuration (Playwright/Puppeteer locale, timezone, viewport, permissions,
// init scripts) is measured. `--context default` forces the browser's default context; `--context
// <id>` names one explicitly.
export function selectBrowserContext(targets: CdpTarget[], requested: string | undefined): BrowserContextSelection {
  if (requested === "default") {
    return { browserContextId: undefined, source: "browser-default", warnings: [] };
  }
  if (requested !== undefined) {
    return { browserContextId: requested, source: "explicit", warnings: [] };
  }

  const pages = targets.filter((target) => target.type === "page" && target.browserContextId !== undefined);
  const first = pages[0];
  if (first === undefined || first.browserContextId === undefined) {
    return { browserContextId: undefined, source: "browser-default", warnings: ["default-browser-context"] };
  }

  const contexts = new Set(pages.map((target) => target.browserContextId));
  return {
    browserContextId: first.browserContextId,
    source: "page-target",
    warnings: contexts.size > 1 ? ["multiple-browser-contexts"] : [],
  };
}

// Chromium answers Target.createTarget with "Failed to find browser context with id ..." when an
// explicit --context id is unknown; surface that as a usage error instead of a CDP failure.
export function rejectedContextError(error: unknown, context: BrowserContextSelection): BotprintError | undefined {
  if (context.source !== "explicit" || context.browserContextId === undefined) return undefined;
  const detail = errorDetail(error);
  if (!/browser context/i.test(detail)) return undefined;
  return new BotprintError(`--context ${context.browserContextId} was rejected by the browser: ${detail}. List context IDs with \`botprint targets --cdp <url> --json\`.`, EXIT_CODES.usage);
}

function buildProfile(
  options: RunOptions,
  browserVersion: Awaited<ReturnType<typeof getBrowserVersion>>,
  probe: ProbeRunResult,
  source: Pick<BotprintProfile["source"], "probe_context" | "target_url"> &
    Partial<Pick<BotprintProfile["source"], "browser_context_id" | "browser_context_source" | "target_id" | "target_type" | "probe_timeout_ms" | "probe_warnings">>,
): BotprintProfile {
  const result = probe.result;
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
        user_agent: result.userAgent,
        user_agent_data: result.userAgentData ?? undefined,
        platform: result.platform,
        language: result.language,
        languages: result.languages,
        plugins_count: result.pluginsCount,
        mime_types_count: result.mimeTypesCount,
        pdf_viewer_enabled: result.pdfViewerEnabled,
      },
      automation: {
        webdriver: result.webdriver,
        chrome_object: result.chromeObject,
        globals: result.automationGlobals,
      },
      environment: {
        timezone: result.timezone,
        viewport: {
          width: result.viewport.width,
          height: result.viewport.height,
          device_scale_factor: result.viewport.deviceScaleFactor,
        },
        outer_window: {
          width: result.outerWindow.width,
          height: result.outerWindow.height,
        },
        screen: {
          width: result.screen.width,
          height: result.screen.height,
          avail_width: result.screen.availWidth,
          avail_height: result.screen.availHeight,
          color_depth: result.screen.colorDepth,
        },
        hardware_concurrency: result.hardwareConcurrency,
        device_memory: result.deviceMemory,
        speech_voices_count: result.speechVoicesCount,
      },
      rendering: {
        webgl: {
          status: availability(result.rendering.webgl.status),
          vendor: optionalString(result.rendering.webgl.vendor),
          renderer: optionalString(result.rendering.webgl.renderer),
          unmasked_vendor: optionalString(result.rendering.webgl.unmaskedVendor),
          unmasked_renderer: optionalString(result.rendering.webgl.unmaskedRenderer),
        },
        canvas: {
          status: canvasStatus(result.rendering.canvas.status),
          hash: optionalString(result.rendering.canvas.hash),
        },
        audio: {
          status: timedAvailability(result.rendering.audio.status),
          hash: optionalString(result.rendering.audio.hash),
        },
        fonts: {
          status: availability(result.rendering.fonts.status),
          checked: result.rendering.fonts.checked,
          detected: [...result.rendering.fonts.detected].sort(),
        },
      },
      storage: {
        cookies_enabled: result.cookiesEnabled,
        local_storage: availability(result.storage.localStorage),
        session_storage: availability(result.storage.sessionStorage),
        indexed_db: timedAvailability(result.storage.indexedDb),
        service_worker: availability(result.storage.serviceWorker),
      },
      permissions: normalizePermissions(result.permissions),
      webrtc: {
        api_available: result.webrtc.apiAvailable,
        host_candidate_gathering: webrtcStatus(result.webrtc.hostCandidateGathering),
        candidate_count: result.webrtc.candidateCount,
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

export function captureRequestHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of CAPTURED_REQUEST_HEADERS) {
    const value = headers.get(name);
    if (value !== null) {
      out[name] = value;
    }
  }
  return out;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function availability(value: unknown): "available" | "unavailable" | "error" {
  return value === "available" || value === "unavailable" || value === "error" ? value : "error";
}

function timedAvailability(value: unknown): "available" | "unavailable" | "error" | "timeout" {
  return value === "available" || value === "unavailable" || value === "error" || value === "timeout" ? value : "error";
}

function canvasStatus(value: unknown): "stable" | "unstable" | "unavailable" | "error" {
  return value === "stable" || value === "unstable" || value === "unavailable" || value === "error" ? value : "error";
}

function webrtcStatus(value: unknown): "present" | "absent" | "unsupported" | "error" | "timeout" {
  return value === "present" || value === "absent" || value === "unsupported" || value === "error" || value === "timeout" ? value : "error";
}

type PermissionState = BotprintProfile["signals"]["permissions"][string];

function normalizePermissions(values: Record<string, string>): Record<string, PermissionState> {
  const out: Record<string, PermissionState> = {};

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

type DiagnosticServer = {
  url: URL;
  stop(force?: boolean): void;
  capturedHeaders(): Record<string, string> | undefined;
};

function startDiagnosticServer(hostname: string): DiagnosticServer {
  let captured: Record<string, string> | undefined;
  try {
    const server = Bun.serve({
      hostname,
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        // Record the top-level document request only; favicon and other follow-up requests
        // carry different Accept/Sec-Fetch headers.
        if (url.pathname === "/" && captured === undefined) {
          captured = captureRequestHeaders(request.headers);
        }
        return new Response("<!doctype html><title>Botprint diagnostic page</title>", {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    });
    return {
      url: server.url,
      stop: (force) => server.stop(force),
      capturedHeaders: () => captured,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new BotprintError(`Failed to bind diagnostic server to ${hostname}: ${detail}`, EXIT_CODES.usage);
  }
}
