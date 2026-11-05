import type { BotprintProfile } from "./profile";
import { parseUserAgent } from "./user-agent";

export type FindingSeverity =
  | "normal"
  | "notable"
  | "warning"
  | "compatibility_risk"
  | "high_confidence_automation_signal";

export type FindingCategory = "automation" | "identity" | "environment" | "rendering" | "storage" | "permissions" | "webrtc" | "http";

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
        suggested_investigation:
          "Chromium sets navigator.webdriver when launched with --enable-automation; Puppeteer and Playwright pass it by default, and Selenium always does. Confirm which launcher produced this browser and whether the baseline was launched the same way.",
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
        suggested_investigation: "cdc_* globals come from ChromeDriver; _phantom and __nightmare from legacy headless stacks. Check the automation framework, browser extensions, and launch wrapper used for this run.",
      };
    },
  },
  {
    id: "identity.headless_user_agent",
    evaluate(profile) {
      const ua = parseUserAgent(profile.signals.identity.user_agent);
      const brands = profile.signals.identity.user_agent_data?.brands.map((entry) => entry.brand) ?? [];
      const headlessBrand = brands.find((brand) => /headless/i.test(brand));
      if (!ua.headless && headlessBrand === undefined) return undefined;
      const evidence: string[] = [];
      if (ua.headless) evidence.push(`User agent reports ${ua.family}/${ua.major ?? "?"}.`);
      if (headlessBrand !== undefined) evidence.push(`Client hint brands include ${headlessBrand}.`);
      return {
        severity: "warning",
        category: "identity",
        title: "Browser identifies itself as headless",
        evidence,
        explanation: "The user agent string and/or the Sec-CH-UA client hint brands advertise a headless browser build.",
        likely_implications: "Sites can distinguish this browser from a normal desktop browser from the first request, before any script runs.",
        suggested_investigation:
          "Chrome's headless shell (`--headless=old`, Playwright's default chromium_headless_shell) reports HeadlessChrome; new headless mode (`--headless=new`, or Playwright's `channel: 'chromium'`) reports Chrome. Check which headless mode and binary each environment launches.",
      };
    },
  },
  {
    id: "automation.chrome_object_missing",
    evaluate(profile) {
      if (profile.signals.automation.chrome_object) return undefined;
      if (!/chrom/i.test(profile.signals.cdp.product)) return undefined;
      return {
        severity: "notable",
        category: "automation",
        title: "window.chrome is missing in a Chromium browser",
        evidence: ["window.chrome is undefined while the CDP product reports a Chromium browser."],
        explanation: "Headed Chrome and new headless mode define window.chrome; the headless shell binary does not.",
        likely_implications: "Scripts that feature-detect Chrome through window.chrome will treat this browser as something else.",
        suggested_investigation: "Check whether the environment runs the headless shell binary rather than the full Chrome/Chromium binary in new headless mode.",
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
        explanation: "Headed Chrome exposes a fixed set of PDF viewer plugins; headless builds expose none.",
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
        explanation: "800x600 is Chromium's default window size for a context with no viewport configured.",
        likely_implications: "Layout, responsive behavior, and environment comparisons may differ from the user's normal browser.",
        suggested_investigation: "Check whether the run configures a viewport (Playwright `viewport`, Puppeteer `defaultViewport`, or `--window-size`) and whether the baseline uses the same value.",
      };
    },
  },
  {
    id: "environment.zero_outer_window",
    evaluate(profile) {
      const outer = profile.signals.environment.outer_window;
      if (outer.width !== 0 && outer.height !== 0) return undefined;
      return {
        severity: "notable",
        category: "environment",
        title: "Outer window size is zero",
        evidence: [`window.outerWidth x outerHeight is ${outer.width}x${outer.height}.`],
        explanation: "A headed browser window always has a non-zero outer size. Zero outer dimensions indicate a headless or windowless context.",
        likely_implications: "Scripts that compare inner and outer window sizes will classify this browser as headless.",
        suggested_investigation: "Confirm the headless mode in use. New headless mode reports a window size; the headless shell does not.",
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
        suggested_investigation: "Software rendering is normal in headless, Docker, and CI without a GPU, and is forced by --disable-gpu. Check the launch flags and whether a GPU is available in the candidate environment.",
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
    id: "rendering.no_common_fonts",
    evaluate(profile) {
      const fonts = profile.signals.rendering.fonts;
      if (fonts.status !== "available" || fonts.checked === 0 || fonts.detected.length > 0) return undefined;
      return {
        severity: "warning",
        category: "rendering",
        title: "No common fonts detected",
        evidence: [`None of ${fonts.checked} common fonts rendered differently from the generic fallback families.`],
        explanation: "The environment appears to have no commonly installed fonts. Text falls back to whatever the system provides, which is often a single generic face or missing glyphs.",
        likely_implications: "Screenshots, layout metrics, and text-dependent rendering will differ from a desktop baseline, and some sites treat an empty font set as a non-standard environment.",
        suggested_investigation: "Check the container or CI image for installed fonts (for example `fc-list`). Minimal Docker images frequently ship none.",
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
        severity: status === "timeout" ? "notable" : "compatibility_risk",
        category: "storage",
        title: status === "timeout" ? "IndexedDB probe timed out" : "IndexedDB is unavailable",
        evidence: [`IndexedDB status is ${status}.`],
        explanation:
          status === "timeout"
            ? "The IndexedDB open request did not settle within the probe timeout. This is a measurement limit, not proof that IndexedDB is unavailable."
            : "The profile could not open a basic IndexedDB database on the probed page.",
        likely_implications: "Applications that rely on browser storage may fail or behave differently in this environment.",
        suggested_investigation:
          status === "timeout"
            ? "Re-run with a larger --probe-timeout. If it persists, check for a slow or blocked storage backend in the candidate environment."
            : "Check browser policy, incognito-like modes, and origin/storage restrictions in the candidate environment.",
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
    id: "permissions.notifications_denied",
    evaluate(profile) {
      if (profile.signals.permissions.notification_api !== "denied") return undefined;
      return {
        severity: "notable",
        category: "permissions",
        title: "Notification permission is denied by default",
        evidence: ["Notification.permission is denied on a fresh page."],
        explanation: "A fresh headed Chrome profile reports Notification.permission as default (prompt). Headless Chrome reports denied without any user interaction.",
        likely_implications: "This is a well-known headless indicator, and notification-dependent features will not prompt.",
        suggested_investigation: "Confirm the headless mode in use, or whether a policy or context option denies notifications in the candidate environment.",
      };
    },
  },
  {
    id: "webrtc.host_candidate_error",
    evaluate(profile) {
      const webrtc = profile.signals.webrtc;
      if (webrtc.host_candidate_gathering !== "error" && webrtc.host_candidate_gathering !== "timeout") return undefined;
      return {
        severity: "notable",
        category: "webrtc",
        title: `WebRTC host-candidate check ${webrtc.host_candidate_gathering === "timeout" ? "timed out" : "errored"}`,
        evidence: [`WebRTC host-candidate gathering status is ${webrtc.host_candidate_gathering}.`],
        explanation: "The browser exposed WebRTC APIs, but the local no-STUN candidate probe did not complete.",
        likely_implications: "WebRTC-dependent behavior may differ from the baseline.",
        suggested_investigation: "Check browser policy, network sandboxing, and runtime permissions for the candidate environment. For a timeout, re-run with a larger --probe-timeout.",
      };
    },
  },
  {
    id: "http.accept_language_missing",
    evaluate(profile) {
      const http = profile.signals.http;
      if (http === undefined || http.status !== "captured") return undefined;
      if (http.request_headers["accept-language"] !== undefined) return undefined;
      return {
        severity: "warning",
        category: "http",
        title: "No Accept-Language header is sent",
        evidence: ["The browser's request for the diagnostic page carried no Accept-Language header."],
        explanation: "Every headed browser sends Accept-Language. A missing header usually means the browser was launched with no locale configured, which happens with the headless shell and some minimal containers.",
        likely_implications: "Sites that negotiate language, currency, or region from Accept-Language will serve different content than the baseline, and some treat the missing header as a non-browser client.",
        suggested_investigation: "Set a locale on the context (Playwright `locale`, Puppeteer `--lang`/`--accept-lang`) or in the container environment, matching the baseline.",
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
