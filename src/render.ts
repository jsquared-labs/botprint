import { isObject } from "./coerce";
import type { AbsentValue, CompareResult, ProfileDiff } from "./compare";
import { analyzeProfile, type Finding } from "./findings";
import { SCHEMA_VERSION, validateProfile, type BotprintProfile } from "./profile";

const MAX_REPORT_ITEMS = 5;
const MAX_AGENT_ITEMS = 4;
const AGENT_WORD_LIMIT = 200;

export function renderProfileMarkdown(profile: BotprintProfile, findings: Finding[]): string {
  const lines = [
    `# Botprint Profile: ${profileLabel(profile)}`,
    "",
    "## Summary",
    `- Browser: ${profile.source.browser_version}`,
    `- Target: ${profile.source.target_url}`,
    `- Findings: ${findings.length}`,
    "",
    "## Browser Context",
    `- User agent: ${profile.signals.identity.user_agent}`,
    `- Platform: ${profile.signals.identity.platform}`,
    `- Timezone: ${profile.signals.environment.timezone}`,
    `- Viewport: ${profile.signals.environment.viewport.width}x${profile.signals.environment.viewport.height} @ ${profile.signals.environment.viewport.device_scale_factor}`,
    "",
    "## Key Signals",
    `- WebDriver: ${formatValue(profile.signals.automation.webdriver)}`,
    `- WebGL: ${profile.signals.rendering.webgl.unmasked_renderer ?? profile.signals.rendering.webgl.renderer ?? profile.signals.rendering.webgl.status}`,
    `- Canvas: ${profile.signals.rendering.canvas.status}`,
    `- Storage: cookies=${profile.signals.storage.cookies_enabled}, indexedDB=${profile.signals.storage.indexed_db}`,
  ];

  if (profile.source.probe_warnings !== undefined && profile.source.probe_warnings.length > 0) {
    lines.push("", "## Measurement Notes");
    for (const warning of profile.source.probe_warnings) {
      lines.push(`- ${profileWarningText(warning)}`);
    }
  }

  const top = findings.slice(0, MAX_REPORT_ITEMS);

  if (top.length > 0) {
    lines.push("", "## Top Findings");
    if (findings.length > top.length) {
      lines.push(`_Showing top ${top.length} of ${findings.length} findings. Use \`--json\` for the full finding list._`);
    }
    for (const finding of top) {
      lines.push(`- **${finding.title}** (${finding.severity}): ${finding.evidence.join(" ")}`);
    }
  }

  lines.push("", "## Suggested Investigation");
  if (top.length === 0) {
    lines.push("- No notable P0 findings. Compare this profile against a known-good baseline for drift.");
  } else {
    for (const finding of top) {
      lines.push(`- ${finding.suggested_investigation}`);
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderCompareMarkdown(result: CompareResult): string {
  const warnings = result.verdict.warnings;
  const lines = [
    `# Botprint Compare: ${result.baseline.label} -> ${result.candidate.label}`,
    "",
    "## Summary",
    `- Verdict: ${result.verdict.level}`,
    `- Material: ${result.verdict.material ? "yes" : "no"}`,
    `- Differences: ${result.diffs.length}`,
  ];

  if (result.verdict.categories.length > 0) {
    lines.push(`- Categories: ${result.verdict.categories.join(", ")}`);
  }

  if (warnings.length > 0) {
    lines.push(`- Warnings: ${warnings.map((warning) => warning.id).join(", ")}`);
  }

  if (warnings.length > 0) {
    lines.push("", "## Warnings");
    for (const warning of warnings) {
      lines.push(`- **${warning.id}**: ${warning.summary} ${warning.implications} ${formatEvidence(warning.evidence)}`);
    }
  }

  if (result.diffs.length === 0) {
    lines.push("", "No differences found in the current P0 comparison rules.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("", "## Top Differences");
  const top = topDiffs(result.diffs, MAX_REPORT_ITEMS);
  if (result.diffs.length > top.length) {
    lines.push(`_Showing top ${top.length} of ${result.diffs.length} differences. Use \`--json\` for the full diff list._`);
  }
  for (const diff of top) {
    lines.push(`- **${diff.summary}** (${diff.level}): ${diff.path} ${formatValue(diff.baseline)} -> ${formatValue(diff.candidate)}`);
  }

  lines.push("", "## Interpretation");
  lines.push(compareInterpretation(result));

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderAgentProfileExplanation(profile: BotprintProfile, findings: Finding[]): string {
  const top = findings.slice(0, MAX_AGENT_ITEMS);
  const parts = [
    `Botprint profile for ${profileLabel(profile)} on ${profile.source.browser_version}.`,
    `Context: ${profile.signals.identity.platform}, timezone ${profile.signals.environment.timezone}, viewport ${profile.signals.environment.viewport.width}x${profile.signals.environment.viewport.height}.`,
  ];

  if (top.length === 0) {
    parts.push("No notable P0 findings were generated. Use compare against a known-good baseline to identify environment drift.");
  } else {
    parts.push(`Top findings: ${top.map((finding) => `${finding.id} (${finding.severity})`).join("; ")}.`);
    parts.push(`Investigate: ${top.map((finding) => finding.suggested_investigation).join(" ")}`);
  }

  if (profile.source.probe_warnings !== undefined && profile.source.probe_warnings.length > 0) {
    parts.push(`Measurement notes: ${profile.source.probe_warnings.map(profileWarningText).join(" ")}`);
  }

  return `${limitWords(parts.join(" "), AGENT_WORD_LIMIT)}\n`;
}

export function renderAgentCompareExplanation(result: CompareResult): string {
  const top = topDiffs(result.diffs, MAX_AGENT_ITEMS);
  const warnings = result.verdict.warnings;
  const parts = [
    `Botprint compare ${result.baseline.label} -> ${result.candidate.label}: verdict ${result.verdict.level}, material=${result.verdict.material}.`,
  ];

  if (top.length === 0) {
    parts.push("No differences were found by the current P0 comparison rules.");
  } else {
    parts.push(`Categories: ${result.verdict.categories.join(", ")}.`);
    if (warnings.length > 0) {
      parts.push(`Warnings: ${warnings.map((warning) => `${warning.id}: ${warning.summary} ${warning.implications}`).join("; ")}`);
    }
    parts.push(`Top diffs: ${top.map((diff) => `${diff.path} ${formatValue(diff.baseline)} -> ${formatValue(diff.candidate)} (${diff.level})`).join("; ")}.`);
    parts.push(compareInterpretation(result));
  }

  return `${limitWords(parts.join(" "), AGENT_WORD_LIMIT)}\n`;
}

export function renderAgentExplanation(input: unknown): string {
  if (isCompareResult(input)) {
    return renderAgentCompareExplanation(input);
  }

  const profile = validateProfile(input);
  return renderAgentProfileExplanation(profile, analyzeProfile(profile));
}

function isCompareResult(value: unknown): value is CompareResult {
  if (!isObject(value)) return false;
  const verdict = value.verdict;
  return (
    value.schema_version === SCHEMA_VERSION &&
    Array.isArray(value.diffs) &&
    isObject(value.baseline) &&
    isObject(value.candidate) &&
    isObject(verdict) &&
    typeof verdict.level === "string" &&
    typeof verdict.material === "boolean"
  );
}

function topDiffs(diffs: ProfileDiff[], limit: number): ProfileDiff[] {
  return [...diffs].sort((left, right) => levelRank(right.level) - levelRank(left.level)).slice(0, limit);
}

function levelRank(level: ProfileDiff["level"]): number {
  if (level === "high_confidence_automation") return 3;
  if (level === "material") return 2;
  return 1;
}

function compareInterpretation(result: CompareResult): string {
  if (result.verdict.level === "none") {
    return "The candidate matches the baseline across the current P0 comparison rules.";
  }
  if (result.verdict.level === "advisory") {
    return "The candidate differs from the baseline, but the current P0 rules classify the differences as advisory by default.";
  }
  if (result.verdict.level === "high_confidence_automation") {
    return "The candidate exposes high-confidence automation evidence compared with the baseline.";
  }
  return `The candidate differs materially from the baseline across ${result.verdict.categories.join(", ")} signals.`;
}

function profileLabel(profile: BotprintProfile): string {
  return profile.source.label ?? profile.source.browser_version;
}

function formatValue(value: unknown): string {
  if (isAbsentValue(value)) return "<absent>";
  return JSON.stringify(value);
}

function isAbsentValue(value: unknown): value is AbsentValue {
  return isObject(value) && value.kind === "absent";
}

function formatEvidence(value: Record<string, unknown>): string {
  const entries = Object.entries(value);
  if (entries.length === 0) return "";
  return `(${entries.map(([key, item]) => `${key}=${formatValue(item)}`).join(", ")})`;
}

function profileWarningText(warning: NonNullable<BotprintProfile["source"]["probe_warnings"]>[number]): string {
  if (warning === "page-contamination-possible") {
    return "This existing-target profile may reflect page scripts, framework state, service workers, CSP, cookies, or application state.";
  }
  return warning;
}

function limitWords(value: string, maxWords: number): string {
  const words = value.trim().split(/\s+/);
  if (words.length <= maxWords) return value.trim();
  return `${words.slice(0, maxWords).join(" ")}...`;
}
