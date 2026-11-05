import { describe, expect, test } from "bun:test";
import { analyzeProfile } from "../src/findings";
import { sampleProfile } from "./fixtures/profile";

describe("analyzeProfile", () => {
  test("returns no findings for a boring profile", () => {
    expect(analyzeProfile(sampleProfile()).map((finding) => finding.id)).toEqual([]);
  });

  test("detects high-confidence automation signals", () => {
    const profile = sampleProfile({
      automation: {
        webdriver: true,
        globals: {
          "cdc_*": true,
          "__webdriver_*": false,
        },
      },
    });

    expect(analyzeProfile(profile).map((finding) => finding.id)).toEqual([
      "automation.webdriver_exposed",
      "automation.common_globals_present",
    ]);
  });

  test("detects identity and environment findings", () => {
    const profile = sampleProfile({
      identity: {
        plugins_count: 0,
      },
      viewport: {
        width: 800,
        height: 600,
        device_scale_factor: 1,
      },
    });

    expect(analyzeProfile(profile).map((finding) => finding.id)).toEqual([
      "identity.empty_plugins",
      "environment.default_viewport",
    ]);
  });

  test("detects rendering findings", () => {
    const profile = sampleProfile({
      rendering: {
        webgl: {
          status: "available",
          vendor: "Google Inc.",
          renderer: "WebKit WebGL",
          unmasked_vendor: "Google Inc.",
          unmasked_renderer: "Google SwiftShader",
        },
        canvas: {
          status: "unstable",
        },
      },
    });

    expect(analyzeProfile(profile).map((finding) => finding.id)).toEqual([
      "rendering.swiftshader_webgl",
      "rendering.canvas_unstable",
    ]);
  });

  test("detects headless identity, missing window.chrome, zero outer window, and denied notifications", () => {
    const profile = sampleProfile({
      identity: {
        user_agent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.0.0 Safari/537.36",
        user_agent_data: { brands: [{ brand: "HeadlessChrome", version: "153" }], mobile: false, platform: "Linux" },
      },
      automation: { chrome_object: false },
      environment: { outer_window: { width: 0, height: 0 } },
      permissions: { geolocation: "prompt", notifications: "denied", notification_api: "denied" },
    });

    const findings = analyzeProfile(profile);
    expect(findings.map((finding) => finding.id)).toEqual([
      "identity.headless_user_agent",
      "automation.chrome_object_missing",
      "environment.zero_outer_window",
      "permissions.notifications_denied",
    ]);
    expect(findings[0]?.evidence).toEqual(["User agent reports HeadlessChrome/153.", "Client hint brands include HeadlessChrome."]);
  });

  test("does not flag a missing window.chrome in non-Chromium browsers", () => {
    const profile = sampleProfile({ automation: { chrome_object: false }, cdp: { product: "Firefox/145.0" } });
    expect(analyzeProfile(profile).map((finding) => finding.id)).toEqual([]);
  });

  test("detects missing Accept-Language and empty font sets", () => {
    const profile = sampleProfile({
      http: { status: "captured", request_headers: { accept: "text/html" } },
      rendering: { fonts: { status: "available", checked: 31, detected: [] } },
    });

    expect(analyzeProfile(profile).map((finding) => finding.id)).toEqual(["rendering.no_common_fonts", "http.accept_language_missing"]);
  });

  test("does not report Accept-Language when headers were not captured", () => {
    expect(analyzeProfile(sampleProfile({ http: null })).map((finding) => finding.id)).toEqual([]);
    expect(analyzeProfile(sampleProfile({ http: { status: "not-captured", request_headers: {} } })).map((finding) => finding.id)).toEqual([]);
  });

  test("reports probe timeouts as measurement limits rather than capability loss", () => {
    const profile = sampleProfile({ storage: { indexed_db: "timeout" }, webrtc: { host_candidate_gathering: "timeout" } });
    const findings = analyzeProfile(profile);

    expect(findings.map((finding) => [finding.id, finding.severity])).toEqual([
      ["storage.indexeddb_unavailable", "notable"],
      ["webrtc.host_candidate_error", "notable"],
    ]);
    expect(findings[0]?.title).toBe("IndexedDB probe timed out");
  });

  test("detects storage, permission, and WebRTC findings", () => {
    const profile = sampleProfile({
      storage: {
        cookies_enabled: false,
        indexed_db: "error",
      },
      permissions: {
        geolocation: "error",
        notifications: "prompt",
      },
      webrtc: {
        host_candidate_gathering: "error",
      },
    });

    expect(analyzeProfile(profile).map((finding) => finding.id)).toEqual([
      "storage.cookies_disabled",
      "storage.indexeddb_unavailable",
      "permissions.unexpected_permissions_behavior",
      "webrtc.host_candidate_error",
    ]);
  });

});
