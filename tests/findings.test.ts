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
