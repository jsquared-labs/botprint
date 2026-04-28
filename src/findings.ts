import type { BotprintProfile } from "./profile";

export type FindingSeverity =
  | "normal"
  | "notable"
  | "warning"
  | "compatibility_risk"
  | "high_confidence_automation_signal";

export type FindingCategory = "automation" | "identity" | "environment" | "rendering" | "storage" | "permissions" | "webrtc";

export type Finding = {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  evidence: string[];
  explanation: string;
  likely_implications: string;
  suggested_investigation: string;
};

type FindingRule = {
  id: string;
  evaluate(profile: BotprintProfile): Omit<Finding, "id"> | undefined;
};

const RULES: FindingRule[] = [
  {
    id: "automation.webdriver_exposed",
    evaluate(profile) {
      if (profile.signals.automation.webdriver !== true) return undefined;
      return {
        severity: "high_confidence_automation_signal",
        category: "automation",
        title: "navigator.webdriver is exposed",
        evidence: ["navigator.webdriver is true."],
        explanation: "The browser is explicitly reporting WebDriver automation through a standard browser API.",
        likely_implications: "Sites that treat WebDriver exposure as automation evidence may route this session differently from a normal browser.",
        suggested_investigation: "Confirm which launcher or browser mode produced this profile and compare it against the intended baseline.",
      };
    },
  },
  {
    id: "automation.common_globals_present",
    evaluate(profile) {
      const present = Object.entries(profile.signals.automation.globals)
        .filter(([, value]) => value)
        .map(([name]) => name)
        .sort();
      if (present.length === 0) return undefined;
      return {
        severity: "high_confidence_automation_signal",
        category: "automation",
        title: "Known automation globals are present",
        evidence: [`Present globals: ${present.join(", ")}.`],
        explanation: "One or more fixed automation marker globals were visible on the page window.",
        likely_implications: "This is strong evidence that the browser context was created or modified by an automation stack.",
        suggested_investigation: "Check the automation framework, browser extension set, and launch wrapper used for this run.",
      };
    },
  },
  {
    id: "identity.empty_plugins",
    evaluate(profile) {
      if (profile.signals.identity.plugins_count !== 0) return undefined;
      return {
        severity: "notable",
        category: "identity",
        title: "Plugin list is empty",
        evidence: ["navigator.plugins.length is 0."],
        explanation: "An empty plugin list can be normal in some browser modes, but it is uncommon enough to be useful context.",
        likely_implications: "This may help explain differences between local, Docker, CI, and remote-browser profiles.",
        suggested_investigation: "Compare the same signal across the baseline browser and the candidate browser before treating it as material.",
      };
    },
  },
  {
    id: "environment.default_viewport",
    evaluate(profile) {
      const viewport = profile.signals.environment.viewport;
      if (viewport.width !== 800 || viewport.height !== 600 || viewport.device_scale_factor !== 1) return undefined;
      return {
        severity: "notable",
        category: "environment",
        title: "Viewport matches a common automation default",
        evidence: ["Viewport is 800x600 with device scale factor 1."],
        explanation: "This viewport is a common default for automated or freshly launched browser sessions.",
        likely_implications: "Layout, responsive behavior, and environment comparisons may differ from the user's normal browser.",
        suggested_investigation: "Verify the viewport configuration used by the run and compare it with the intended baseline.",
      };
    },
  },
  {
    id: "rendering.swiftshader_webgl",
    evaluate(profile) {
      const webgl = profile.signals.rendering.webgl;
      const renderer = [webgl.renderer, webgl.unmasked_renderer].filter(Boolean).join(" ");
      if (!/swiftshader|llvmpipe/i.test(renderer)) return undefined;
      return {
        severity: "warning",
        category: "rendering",
        title: "Software WebGL renderer detected",
        evidence: [`Renderer evidence: ${renderer}.`],
        explanation: "The WebGL renderer appears to be software-backed rather than normal device GPU rendering.",
        likely_implications: "Rendering hashes and graphics capability may differ materially from a desktop browser baseline.",
        suggested_investigation: "Check whether the candidate ran in headless, Docker, CI, or a GPU-disabled environment.",
      };
    },
  },
  {
    id: "rendering.webgl_unavailable",
    evaluate(profile) {
      const status = profile.signals.rendering.webgl.status;
      if (status === "available") return undefined;
      return {
        severity: "compatibility_risk",
        category: "rendering",
        title: "WebGL is not available",
        evidence: [`WebGL status is ${status}.`],
        explanation: "The browser could not provide a usable WebGL context during the probe.",
        likely_implications: "Pages that depend on graphics APIs may behave differently, and rendering comparison signals will be limited.",
        suggested_investigation: "Check browser launch flags, headless mode, GPU availability, and the runtime environment.",
      };
    },
  },
  {
    id: "rendering.unmasked_webgl_unavailable",
    evaluate(profile) {
      const webgl = profile.signals.rendering.webgl;
      if (webgl.status !== "available" || webgl.unmasked_renderer !== undefined || webgl.unmasked_vendor !== undefined) return undefined;
      return {
        severity: "notable",
        category: "rendering",
        title: "Unmasked WebGL details are unavailable",
        evidence: ["WEBGL_debug_renderer_info did not expose unmasked vendor or renderer details."],
        explanation: "Some browser configurations withhold unmasked WebGL details. This is not proof of automation by itself.",
        likely_implications: "Renderer comparisons may have less detail than expected for this profile.",
        suggested_investigation: "Compare masked and unmasked WebGL availability across the baseline and candidate profiles.",
      };
    },
  },
  {
    id: "rendering.canvas_unstable",
    evaluate(profile) {
      const status = profile.signals.rendering.canvas.status;
      if (status === "stable") return undefined;
      return {
        severity: status === "unstable" ? "notable" : "compatibility_risk",
        category: "rendering",
        title: "Canvas sample was not stable",
        evidence: [`Canvas status is ${status}.`],
        explanation: "Botprint only emits a canvas hash when the same sample is stable twice in one probe run.",
        likely_implications: "Canvas cannot be used as a reliable comparison signal for this profile.",
        suggested_investigation: "Re-run the profile and compare browser version, GPU, and runtime environment if instability persists.",
      };
    },
  },
  {
    id: "storage.cookies_disabled",
    evaluate(profile) {
      if (profile.signals.storage.cookies_enabled) return undefined;
      return {
        severity: "compatibility_risk",
        category: "storage",
        title: "Cookies are disabled",
        evidence: ["navigator.cookieEnabled is false."],
        explanation: "The profile reports that browser cookies are disabled.",
        likely_implications: "Authentication, personalization, and many application flows may diverge from the baseline.",
        suggested_investigation: "Confirm whether cookies were intentionally disabled for this browser context.",
      };
    },
  },
  {
    id: "storage.indexeddb_unavailable",
    evaluate(profile) {
      const status = profile.signals.storage.indexed_db;
      if (status === "available") return undefined;
      return {
        severity: "compatibility_risk",
        category: "storage",
        title: "IndexedDB is unavailable",
        evidence: [`IndexedDB status is ${status}.`],
        explanation: "The profile could not open a basic IndexedDB database on the probed page.",
        likely_implications: "Applications that rely on browser storage may fail or behave differently in this environment.",
        suggested_investigation: "Check browser policy, incognito-like modes, and origin/storage restrictions in the candidate environment.",
      };
    },
  },
  {
    id: "permissions.unexpected_permissions_behavior",
    evaluate(profile) {
      const unusual = Object.entries(profile.signals.permissions)
        .filter(([, value]) => value === "error" || value === "unknown")
        .map(([name, value]) => `${name}=${value}`)
        .sort();
      if (unusual.length === 0) return undefined;
      return {
        severity: "notable",
        category: "permissions",
        title: "Permission queries returned unusual states",
        evidence: [`Permission states: ${unusual.join(", ")}.`],
        explanation: "At least one Permissions API query returned an error or an unrecognized state.",
        likely_implications: "Permission-dependent application flows may not match the baseline browser.",
        suggested_investigation: "Compare the same permission queries across Chrome versions and browser launch modes.",
      };
    },
  },
  {
    id: "webrtc.host_candidate_error",
    evaluate(profile) {
      const webrtc = profile.signals.webrtc;
      if (webrtc.host_candidate_gathering !== "error") return undefined;
      return {
        severity: "notable",
        category: "webrtc",
        title: "WebRTC host-candidate check errored",
        evidence: ["WebRTC host-candidate gathering status is error."],
        explanation: "The browser exposed WebRTC APIs, but the local no-STUN candidate probe failed.",
        likely_implications: "WebRTC-dependent behavior may differ from the baseline, and richer leak testing would need an explicit opt-in probe.",
        suggested_investigation: "Check browser policy, network sandboxing, and runtime permissions for the candidate environment.",
      };
    },
  },
];

export function analyzeProfile(profile: BotprintProfile): Finding[] {
  return RULES.flatMap((rule) => {
    const result = rule.evaluate(profile);
    return result === undefined ? [] : [{ id: rule.id, ...result }];
  });
}
