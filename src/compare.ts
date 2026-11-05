import type { FindingCategory } from "./findings";
import { SCHEMA_VERSION, type BotprintProfile } from "./profile";
import { parseBrowserProduct, parseUserAgent } from "./user-agent";
import { BOTPRINT_VERSION } from "./version";

export type VerdictLevel = "none" | "advisory" | "material" | "high_confidence_automation";
export type DiffLevel = Exclude<VerdictLevel, "none">;
export type AbsentValue = { kind: "absent" };

export type DiffCategory = FindingCategory | "cdp";

export type ProfileDiff = {
  id: string;
  category: DiffCategory;
  level: DiffLevel;
  path: string;
  baseline: unknown;
  candidate: unknown;
  summary: string;
};

const ABSENT_VALUE: AbsentValue = { kind: "absent" };

export type CompareWarningId =
  | "comparison.browser_binary_mismatch"
  | "comparison.headless_mode_mismatch"
  | "comparison.probe_context_mismatch"
  | "comparison.browser_context_mismatch"
  | "comparison.http_not_captured";

export type CompareWarning = {
  id: CompareWarningId;
  summary: string;
  implications: string;
  evidence: Record<string, unknown>;
};

export type CompareResult = {
  schema_version: typeof SCHEMA_VERSION;
  botprint_version: string;
  created_at: string;
  baseline: {
    label: string;
    profile_path: string;
  };
  candidate: {
    label: string;
    profile_path: string;
  };
  diffs: ProfileDiff[];
  verdict: {
    level: VerdictLevel;
    material: boolean;
    categories: DiffCategory[];
    warnings: CompareWarning[];
  };
};

type CompareInput = {
  baseline: BotprintProfile;
  baselinePath: string;
  candidate: BotprintProfile;
  candidatePath: string;
};

export function compareProfiles(input: CompareInput): CompareResult {
  const diffs = collectDiffs(input.baseline, input.candidate);
  const level = verdictLevel(diffs);
  const warnings = collectWarnings(input.baseline, input.candidate);

  return {
    schema_version: SCHEMA_VERSION,
    botprint_version: BOTPRINT_VERSION,
    created_at: new Date().toISOString(),
    baseline: {
      label: profileLabel(input.baseline, input.baselinePath),
      profile_path: input.baselinePath,
    },
    candidate: {
      label: profileLabel(input.candidate, input.candidatePath),
      profile_path: input.candidatePath,
    },
    diffs,
    verdict: {
      level,
      material: level === "material" || level === "high_confidence_automation",
      categories: uniqueCategories(diffs),
      warnings,
    },
  };
}

function collectWarnings(baseline: BotprintProfile, candidate: BotprintProfile): CompareWarning[] {
  const warnings: CompareWarning[] = [];
  if (baseline.source.probe_context !== candidate.source.probe_context) {
    warnings.push({
      id: "comparison.probe_context_mismatch",
      summary: "Profiles were collected with different probe contexts.",
      implications: "Diffs may include artifacts of page state, framework behavior, or measurement mode rather than browser-environment drift alone.",
      evidence: {
        baseline_probe_context: baseline.source.probe_context,
        candidate_probe_context: candidate.source.probe_context,
      },
    });
  }

  const baselineContext = baseline.source.browser_context_source;
  const candidateContext = candidate.source.browser_context_source;
  if (baselineContext !== undefined && candidateContext !== undefined && baselineContext !== candidateContext) {
    warnings.push({
      id: "comparison.browser_context_mismatch",
      summary: "Profiles were collected from different kinds of browser context.",
      implications: "One profile measured a page-target context (framework options applied) and the other the browser default context. Locale, timezone, viewport, and permission diffs may be context configuration rather than environment drift.",
      evidence: {
        baseline_browser_context_source: baselineContext,
        candidate_browser_context_source: candidateContext,
      },
    });
  }

  const baselineProduct = parseBrowserProduct(baseline.signals.cdp.product);
  const candidateProduct = parseBrowserProduct(candidate.signals.cdp.product);
  const familyChanged = baselineProduct.binaryFamily !== candidateProduct.binaryFamily;
  const majorDelta =
    baselineProduct.major === undefined || candidateProduct.major === undefined
      ? 0
      : Math.abs(baselineProduct.major - candidateProduct.major);

  if (familyChanged || majorDelta >= 2) {
    warnings.push({
      id: "comparison.browser_binary_mismatch",
      summary: "Baseline and candidate were collected from different browser binaries.",
      implications: "Diffs below may include artifacts of the binary difference, not environment drift alone.",
      evidence: {
        baseline_product: baseline.signals.cdp.product,
        candidate_product: candidate.signals.cdp.product,
      },
    });
  }

  // The CDP product says "HeadlessChrome" only for the headless shell; new headless mode reports
  // "Chrome" there while still reporting HeadlessChrome in the user agent. Check both.
  const baselineUserAgent = baseline.signals.identity.user_agent;
  const candidateUserAgent = candidate.signals.identity.user_agent;
  const shellMismatch = baselineProduct.headless !== candidateProduct.headless;
  const userAgentMismatch = baselineUserAgent !== candidateUserAgent && parseUserAgent(baselineUserAgent).headless !== parseUserAgent(candidateUserAgent).headless;
  if (shellMismatch || userAgentMismatch) {
    const text = shellMismatch
      ? {
          summary: "One profile came from the headless shell binary and the other from a headed or new-headless build.",
          implications:
            "Plugin counts, window.chrome, outer window size, and notification permission change with the headless shell; the user agent changes only against a headed build. Treat those diffs as mode differences unless the environments are meant to match.",
        }
      : {
          summary: "One profile came from a headless browser and the other from a headed one.",
          implications:
            "Both Chromium headless modes report HeadlessChrome in the user agent while the CDP product still says Chrome. Treat the user agent diff as a mode difference unless the environments are meant to match.",
        };
    warnings.push({
      id: "comparison.headless_mode_mismatch",
      ...text,
      evidence: {
        baseline_product: baseline.signals.cdp.product,
        candidate_product: candidate.signals.cdp.product,
        baseline_user_agent: baselineUserAgent,
        candidate_user_agent: candidateUserAgent,
      },
    });
  }

  const baselineHttp = baseline.signals.http?.status === "captured";
  const candidateHttp = candidate.signals.http?.status === "captured";
  if (baselineHttp !== candidateHttp) {
    warnings.push({
      id: "comparison.http_not_captured",
      summary: "HTTP request headers were captured for only one profile.",
      implications: "Header diffs are skipped. Headers are only captured in fresh diagnostic-page mode.",
      evidence: {
        baseline_http_status: baseline.signals.http?.status ?? "absent",
        candidate_http_status: candidate.signals.http?.status ?? "absent",
      },
    });
  }

  return warnings;
}

function collectDiffs(baseline: BotprintProfile, candidate: BotprintProfile): ProfileDiff[] {
  const diffs: ProfileDiff[] = [];
  const b = baseline.signals;
  const c = candidate.signals;

  addDiff(diffs, {
    id: "automation.webdriver_changed",
    category: "automation",
    path: "signals.automation.webdriver",
    baseline: b.automation.webdriver,
    candidate: c.automation.webdriver,
    level: c.automation.webdriver === true ? "high_confidence_automation" : "material",
    summary: "navigator.webdriver changed",
  });

  for (const name of sortedKeys(b.automation.globals, c.automation.globals)) {
    addDiff(diffs, {
      id: `automation.global.${name}`,
      category: "automation",
      path: `signals.automation.globals.${name}`,
      baseline: b.automation.globals[name] === true,
      candidate: c.automation.globals[name] === true,
      level: c.automation.globals[name] === true ? "high_confidence_automation" : "material",
      summary: `Automation global ${name} changed`,
    });
  }

  addDiff(diffs, material("automation.chrome_object_changed", "automation", "signals.automation.chrome_object", b.automation.chrome_object, c.automation.chrome_object, "window.chrome presence changed"));

  addDiff(
    diffs,
    advisory("identity.user_agent_changed", "identity", "signals.identity.user_agent", b.identity.user_agent, c.identity.user_agent, "User agent changed"),
    sameUserAgentValue,
  );
  addDiff(diffs, advisory("identity.user_agent_data_changed", "identity", "signals.identity.user_agent_data", b.identity.user_agent_data, c.identity.user_agent_data, "Client hint brands or platform changed"));
  addDiff(diffs, advisory("identity.platform_changed", "identity", "signals.identity.platform", b.identity.platform, c.identity.platform, "Platform changed"));
  addDiff(diffs, advisory("identity.language_changed", "identity", "signals.identity.language", b.identity.language, c.identity.language, "navigator.language changed"));
  addDiff(diffs, advisory("identity.languages_changed", "identity", "signals.identity.languages", b.identity.languages, c.identity.languages, "Languages changed"));
  addDiff(diffs, advisory("identity.plugins_count_changed", "identity", "signals.identity.plugins_count", b.identity.plugins_count, c.identity.plugins_count, "Plugin count changed"));
  addDiff(diffs, advisory("identity.mime_types_count_changed", "identity", "signals.identity.mime_types_count", b.identity.mime_types_count, c.identity.mime_types_count, "MIME type count changed"));
  addDiff(diffs, advisory("identity.pdf_viewer_changed", "identity", "signals.identity.pdf_viewer_enabled", b.identity.pdf_viewer_enabled, c.identity.pdf_viewer_enabled, "PDF viewer availability changed"));

  addDiff(diffs, material("environment.timezone_changed", "environment", "signals.environment.timezone", b.environment.timezone, c.environment.timezone, "Timezone changed"));
  addDiff(diffs, advisory("environment.viewport_changed", "environment", "signals.environment.viewport", b.environment.viewport, c.environment.viewport, "Viewport changed"));
  addDiff(diffs, advisory("environment.outer_window_changed", "environment", "signals.environment.outer_window", b.environment.outer_window, c.environment.outer_window, "Outer window size changed"));
  addDiff(diffs, advisory("environment.screen_changed", "environment", "signals.environment.screen", b.environment.screen, c.environment.screen, "Screen metrics changed"));
  addDiff(diffs, advisory("environment.hardware_concurrency_changed", "environment", "signals.environment.hardware_concurrency", b.environment.hardware_concurrency, c.environment.hardware_concurrency, "Hardware concurrency changed"));
  addDiff(diffs, advisory("environment.device_memory_changed", "environment", "signals.environment.device_memory", b.environment.device_memory, c.environment.device_memory, "Device memory changed"));
  addDiff(diffs, advisory("environment.speech_voices_changed", "environment", "signals.environment.speech_voices_count", b.environment.speech_voices_count, c.environment.speech_voices_count, "Speech synthesis voice count changed"));

  addDiff(diffs, material("rendering.webgl_status_changed", "rendering", "signals.rendering.webgl.status", b.rendering.webgl.status, c.rendering.webgl.status, "WebGL availability changed"));
  addDiff(diffs, material("rendering.webgl_renderer_changed", "rendering", "signals.rendering.webgl.unmasked_renderer", b.rendering.webgl.unmasked_renderer ?? b.rendering.webgl.renderer, c.rendering.webgl.unmasked_renderer ?? c.rendering.webgl.renderer, "WebGL renderer changed"));
  addDiff(diffs, advisory("rendering.canvas_status_changed", "rendering", "signals.rendering.canvas.status", b.rendering.canvas.status, c.rendering.canvas.status, "Canvas status changed"));
  addDiff(diffs, advisory("rendering.canvas_hash_changed", "rendering", "signals.rendering.canvas.hash", b.rendering.canvas.hash, c.rendering.canvas.hash, "Canvas hash changed"));
  addDiff(diffs, advisory("rendering.audio_status_changed", "rendering", "signals.rendering.audio.status", b.rendering.audio.status, c.rendering.audio.status, "Audio rendering status changed"));
  addDiff(diffs, advisory("rendering.audio_hash_changed", "rendering", "signals.rendering.audio.hash", b.rendering.audio.hash, c.rendering.audio.hash, "Audio hash changed"));
  addDiff(diffs, fontsDiff(b.rendering.fonts, c.rendering.fonts));

  addDiff(diffs, storageDiff("storage.cookies_enabled_changed", "signals.storage.cookies_enabled", b.storage.cookies_enabled, c.storage.cookies_enabled, "Cookie availability changed"));
  addDiff(diffs, storageDiff("storage.local_storage_changed", "signals.storage.local_storage", b.storage.local_storage, c.storage.local_storage, "localStorage availability changed"));
  addDiff(diffs, storageDiff("storage.session_storage_changed", "signals.storage.session_storage", b.storage.session_storage, c.storage.session_storage, "sessionStorage availability changed"));
  addDiff(diffs, storageDiff("storage.indexed_db_changed", "signals.storage.indexed_db", b.storage.indexed_db, c.storage.indexed_db, "IndexedDB availability changed"));
  addDiff(diffs, storageDiff("storage.service_worker_changed", "signals.storage.service_worker", b.storage.service_worker, c.storage.service_worker, "Service worker availability changed"));

  for (const name of sortedKeys(b.permissions, c.permissions)) {
    addDiff(diffs, advisory(`permissions.${name}_changed`, "permissions", `signals.permissions.${name}`, b.permissions[name], c.permissions[name], `Permission state changed for ${name}`));
  }

  addDiff(diffs, advisory("webrtc.api_available_changed", "webrtc", "signals.webrtc.api_available", b.webrtc.api_available, c.webrtc.api_available, "WebRTC API availability changed"));
  addDiff(diffs, advisory("webrtc.host_candidate_gathering_changed", "webrtc", "signals.webrtc.host_candidate_gathering", b.webrtc.host_candidate_gathering, c.webrtc.host_candidate_gathering, "WebRTC host-candidate gathering changed"));
  addDiff(diffs, advisory("webrtc.candidate_count_changed", "webrtc", "signals.webrtc.candidate_count", b.webrtc.candidate_count, c.webrtc.candidate_count, "WebRTC candidate count changed"));

  if (b.http?.status === "captured" && c.http?.status === "captured") {
    for (const name of sortedKeys(b.http.request_headers, c.http.request_headers)) {
      const level: DiffLevel = name === "accept-language" ? "material" : "advisory";
      const equal = name === "user-agent" ? sameUserAgentValue : sameValue;
      addDiff(diffs, {
        id: `http.header.${name}_changed`,
        category: "http",
        level,
        path: `signals.http.request_headers.${name}`,
        baseline: b.http.request_headers[name],
        candidate: c.http.request_headers[name],
        summary: `Request header ${name} changed`,
      }, equal);
    }
  }

  addDiff(diffs, advisory("cdp.product_changed", "cdp", "signals.cdp.product", b.cdp.product, c.cdp.product, "CDP product changed"));
  addDiff(diffs, advisory("cdp.protocol_version_changed", "cdp", "signals.cdp.protocol_version", b.cdp.protocol_version, c.cdp.protocol_version, "CDP protocol version changed"));

  return diffs;
}

function advisory(id: string, category: DiffCategory, path: string, baseline: unknown, candidate: unknown, summary: string): ProfileDiff {
  return { id, category, level: "advisory", path, baseline, candidate, summary };
}

function material(id: string, category: DiffCategory, path: string, baseline: unknown, candidate: unknown, summary: string): ProfileDiff {
  return { id, category, level: "material", path, baseline, candidate, summary };
}

function storageDiff(id: string, path: string, baseline: unknown, candidate: unknown, summary: string): ProfileDiff {
  const level = baseline === true || baseline === "available" ? "material" : "advisory";
  return { id, category: "storage", level, path, baseline, candidate, summary };
}

type Fonts = BotprintProfile["signals"]["rendering"]["fonts"];

// Losing fonts the baseline had is material (text renders differently); gaining fonts is advisory.
function fontsDiff(baseline: Fonts, candidate: Fonts): ProfileDiff {
  const candidateSet = new Set(candidate.detected);
  const lost = baseline.detected.filter((font) => !candidateSet.has(font));
  return {
    id: "rendering.fonts_changed",
    category: "rendering",
    level: lost.length > 0 ? "material" : "advisory",
    path: "signals.rendering.fonts.detected",
    baseline: baseline.detected,
    candidate: candidate.detected,
    summary: "Detected font set changed",
  };
}

function addDiff(diffs: ProfileDiff[], diff: ProfileDiff, equal: (left: unknown, right: unknown) => boolean = sameValue): void {
  if (!equal(diff.baseline, diff.candidate)) {
    diffs.push({
      ...diff,
      baseline: serializableValue(diff.baseline),
      candidate: serializableValue(diff.candidate),
    });
  }
}

function serializableValue(value: unknown): unknown {
  return value === undefined ? ABSENT_VALUE : value;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

const sameUserAgentValue = (left: unknown, right: unknown): boolean => sameUserAgent(String(left), String(right));

function sameUserAgent(left: string, right: string): boolean {
  if (left === right) return true;
  const parsedLeft = parseUserAgent(left);
  const parsedRight = parseUserAgent(right);
  if (parsedLeft.family === "other" || parsedRight.family === "other") return false;
  return parsedLeft.family === parsedRight.family && parsedLeft.major === parsedRight.major && platformToken(left) === platformToken(right);
}

function platformToken(userAgent: string): string {
  const match = /\(([^)]*)\)/.exec(userAgent);
  return match?.[1] ?? "";
}

function verdictLevel(diffs: ProfileDiff[]): VerdictLevel {
  if (diffs.some((diff) => diff.level === "high_confidence_automation")) return "high_confidence_automation";
  if (diffs.some((diff) => diff.level === "material")) return "material";
  if (diffs.length > 0) return "advisory";
  return "none";
}

function uniqueCategories(diffs: ProfileDiff[]): DiffCategory[] {
  return Array.from(new Set(diffs.map((diff) => diff.category))).sort();
}

function sortedKeys(left: Record<string, unknown>, right: Record<string, unknown>): string[] {
  return Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
}

function profileLabel(profile: BotprintProfile, path: string): string {
  return profile.source.label ?? path;
}
