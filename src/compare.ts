import type { FindingCategory } from "./findings";
import { SCHEMA_VERSION, type BotprintProfile } from "./profile";
import { BOTPRINT_VERSION } from "./version";

export type VerdictLevel = "none" | "advisory" | "material" | "high_confidence_automation";
export type DiffLevel = Exclude<VerdictLevel, "none">;
export type AbsentValue = { kind: "absent" };

export type ProfileDiff = {
  id: string;
  category: FindingCategory | "cdp";
  level: DiffLevel;
  path: string;
  baseline: unknown;
  candidate: unknown;
  summary: string;
};

const ABSENT_VALUE: AbsentValue = { kind: "absent" };

export type CompareWarning = {
  id: "comparison.browser_binary_mismatch" | "comparison.probe_context_mismatch";
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
    categories: Array<ProfileDiff["category"]>;
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

  const baselineProduct = parseBrowserProduct(baseline.signals.cdp.product);
  const candidateProduct = parseBrowserProduct(candidate.signals.cdp.product);
  const familyChanged = baselineProduct.family !== candidateProduct.family;
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

  return warnings;
}

function collectDiffs(baseline: BotprintProfile, candidate: BotprintProfile): ProfileDiff[] {
  const diffs: ProfileDiff[] = [];

  addDiff(diffs, {
    id: "automation.webdriver_changed",
    category: "automation",
    path: "signals.automation.webdriver",
    baseline: baseline.signals.automation.webdriver,
    candidate: candidate.signals.automation.webdriver,
    level: candidate.signals.automation.webdriver === true ? "high_confidence_automation" : "material",
    summary: "navigator.webdriver changed",
  });

  for (const name of sortedKeys(baseline.signals.automation.globals, candidate.signals.automation.globals)) {
    addDiff(diffs, {
      id: `automation.global.${name}`,
      category: "automation",
      path: `signals.automation.globals.${name}`,
      baseline: baseline.signals.automation.globals[name] === true,
      candidate: candidate.signals.automation.globals[name] === true,
      level: candidate.signals.automation.globals[name] === true ? "high_confidence_automation" : "material",
      summary: `Automation global ${name} changed`,
    });
  }

  addDiff(diffs, advisory("identity.user_agent_changed", "identity", "signals.identity.user_agent", baseline.signals.identity.user_agent, candidate.signals.identity.user_agent, "User agent changed"));
  addDiff(diffs, advisory("identity.platform_changed", "identity", "signals.identity.platform", baseline.signals.identity.platform, candidate.signals.identity.platform, "Platform changed"));
  addDiff(diffs, advisory("identity.languages_changed", "identity", "signals.identity.languages", baseline.signals.identity.languages, candidate.signals.identity.languages, "Languages changed"));
  addDiff(diffs, advisory("identity.plugins_count_changed", "identity", "signals.identity.plugins_count", baseline.signals.identity.plugins_count, candidate.signals.identity.plugins_count, "Plugin count changed"));
  addDiff(diffs, advisory("identity.mime_types_count_changed", "identity", "signals.identity.mime_types_count", baseline.signals.identity.mime_types_count, candidate.signals.identity.mime_types_count, "MIME type count changed"));

  addDiff(diffs, material("environment.timezone_changed", "environment", "signals.environment.timezone", baseline.signals.environment.timezone, candidate.signals.environment.timezone, "Timezone changed"));
  addDiff(diffs, advisory("environment.viewport_changed", "environment", "signals.environment.viewport", baseline.signals.environment.viewport, candidate.signals.environment.viewport, "Viewport changed"));
  addDiff(diffs, advisory("environment.screen_changed", "environment", "signals.environment.screen", baseline.signals.environment.screen, candidate.signals.environment.screen, "Screen metrics changed"));
  addDiff(diffs, advisory("environment.hardware_concurrency_changed", "environment", "signals.environment.hardware_concurrency", baseline.signals.environment.hardware_concurrency, candidate.signals.environment.hardware_concurrency, "Hardware concurrency changed"));
  addDiff(diffs, advisory("environment.device_memory_changed", "environment", "signals.environment.device_memory", baseline.signals.environment.device_memory, candidate.signals.environment.device_memory, "Device memory changed"));

  addDiff(diffs, material("rendering.webgl_status_changed", "rendering", "signals.rendering.webgl.status", baseline.signals.rendering.webgl.status, candidate.signals.rendering.webgl.status, "WebGL availability changed"));
  addDiff(diffs, material("rendering.webgl_renderer_changed", "rendering", "signals.rendering.webgl.unmasked_renderer", baseline.signals.rendering.webgl.unmasked_renderer ?? baseline.signals.rendering.webgl.renderer, candidate.signals.rendering.webgl.unmasked_renderer ?? candidate.signals.rendering.webgl.renderer, "WebGL renderer changed"));
  addDiff(diffs, advisory("rendering.canvas_status_changed", "rendering", "signals.rendering.canvas.status", baseline.signals.rendering.canvas.status, candidate.signals.rendering.canvas.status, "Canvas status changed"));
  addDiff(diffs, advisory("rendering.canvas_hash_changed", "rendering", "signals.rendering.canvas.hash", baseline.signals.rendering.canvas.hash, candidate.signals.rendering.canvas.hash, "Canvas hash changed"));

  addDiff(diffs, storageDiff("storage.cookies_enabled_changed", "signals.storage.cookies_enabled", baseline.signals.storage.cookies_enabled, candidate.signals.storage.cookies_enabled, "Cookie availability changed"));
  addDiff(diffs, storageDiff("storage.local_storage_changed", "signals.storage.local_storage", baseline.signals.storage.local_storage, candidate.signals.storage.local_storage, "localStorage availability changed"));
  addDiff(diffs, storageDiff("storage.session_storage_changed", "signals.storage.session_storage", baseline.signals.storage.session_storage, candidate.signals.storage.session_storage, "sessionStorage availability changed"));
  addDiff(diffs, storageDiff("storage.indexed_db_changed", "signals.storage.indexed_db", baseline.signals.storage.indexed_db, candidate.signals.storage.indexed_db, "IndexedDB availability changed"));
  addDiff(diffs, storageDiff("storage.service_worker_changed", "signals.storage.service_worker", baseline.signals.storage.service_worker, candidate.signals.storage.service_worker, "Service worker availability changed"));

  for (const name of sortedKeys(baseline.signals.permissions, candidate.signals.permissions)) {
    addDiff(diffs, advisory(`permissions.${name}_changed`, "permissions", `signals.permissions.${name}`, baseline.signals.permissions[name], candidate.signals.permissions[name], `Permission state changed for ${name}`));
  }

  addDiff(diffs, advisory("webrtc.api_available_changed", "webrtc", "signals.webrtc.api_available", baseline.signals.webrtc.api_available, candidate.signals.webrtc.api_available, "WebRTC API availability changed"));
  addDiff(diffs, advisory("webrtc.host_candidate_gathering_changed", "webrtc", "signals.webrtc.host_candidate_gathering", baseline.signals.webrtc.host_candidate_gathering, candidate.signals.webrtc.host_candidate_gathering, "WebRTC host-candidate gathering changed"));
  addDiff(diffs, advisory("webrtc.candidate_count_changed", "webrtc", "signals.webrtc.candidate_count", baseline.signals.webrtc.candidate_count, candidate.signals.webrtc.candidate_count, "WebRTC candidate count changed"));

  addDiff(diffs, advisory("cdp.product_changed", "cdp", "signals.cdp.product", baseline.signals.cdp.product, candidate.signals.cdp.product, "CDP product changed"));
  addDiff(diffs, advisory("cdp.protocol_version_changed", "cdp", "signals.cdp.protocol_version", baseline.signals.cdp.protocol_version, candidate.signals.cdp.protocol_version, "CDP protocol version changed"));

  return diffs;
}

function advisory(id: string, category: ProfileDiff["category"], path: string, baseline: unknown, candidate: unknown, summary: string): ProfileDiff {
  return { id, category, level: "advisory", path, baseline, candidate, summary };
}

function material(id: string, category: ProfileDiff["category"], path: string, baseline: unknown, candidate: unknown, summary: string): ProfileDiff {
  return { id, category, level: "material", path, baseline, candidate, summary };
}

function storageDiff(id: string, path: string, baseline: unknown, candidate: unknown, summary: string): ProfileDiff {
  const level = baseline === true || baseline === "available" ? "material" : "advisory";
  return { id, category: "storage", level, path, baseline, candidate, summary };
}

function addDiff(diffs: ProfileDiff[], diff: ProfileDiff): void {
  if (!sameValue(diff.baseline, diff.candidate)) {
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

function verdictLevel(diffs: ProfileDiff[]): VerdictLevel {
  if (diffs.some((diff) => diff.level === "high_confidence_automation")) return "high_confidence_automation";
  if (diffs.some((diff) => diff.level === "material")) return "material";
  if (diffs.length > 0) return "advisory";
  return "none";
}

function uniqueCategories(diffs: ProfileDiff[]): Array<ProfileDiff["category"]> {
  return Array.from(new Set(diffs.map((diff) => diff.category))).sort();
}

function sortedKeys(left: Record<string, unknown>, right: Record<string, unknown>): string[] {
  return Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
}

function profileLabel(profile: BotprintProfile, path: string): string {
  return profile.source.label ?? path;
}

function parseBrowserProduct(product: string): { family: string; major: number | undefined } {
  const parts = product.split("/", 2);
  const family = parts[0] ?? product;
  const version = parts[1];
  const majorText = version?.split(".", 1)[0];
  const major = majorText === undefined ? undefined : Number.parseInt(majorText, 10);
  return {
    family,
    major: Number.isSafeInteger(major) ? major : undefined,
  };
}
