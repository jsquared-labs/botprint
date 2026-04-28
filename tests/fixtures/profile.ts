import { SCHEMA_VERSION, type BotprintProfile } from "../../src/profile";
import { BOTPRINT_VERSION } from "../../src/version";

type Overrides = {
  source?: Partial<BotprintProfile["source"]>;
  automation?: Partial<BotprintProfile["signals"]["automation"]>;
  identity?: Partial<BotprintProfile["signals"]["identity"]>;
  viewport?: Partial<BotprintProfile["signals"]["environment"]["viewport"]>;
  rendering?: Partial<BotprintProfile["signals"]["rendering"]>;
  storage?: Partial<BotprintProfile["signals"]["storage"]>;
  permissions?: BotprintProfile["signals"]["permissions"];
  webrtc?: Partial<BotprintProfile["signals"]["webrtc"]>;
  cdp?: Partial<BotprintProfile["signals"]["cdp"]>;
};

export function sampleProfile(overrides: Overrides = {}): BotprintProfile {
  const base: BotprintProfile = {
    schema_version: SCHEMA_VERSION,
    botprint_version: BOTPRINT_VERSION,
    created_at: "2026-04-28T00:00:00.000Z",
    source: {
      label: "fixture",
      cdp_endpoint_kind: "http",
      browser_version: "Chrome/147.0.0.0",
      target_url: "http://127.0.0.1:3000/",
      probe_context: "local-diagnostic-page",
      ...overrides.source,
    },
    signals: {
      identity: {
        user_agent: "Mozilla/5.0",
        platform: "MacIntel",
        languages: ["en-US", "en"],
        plugins_count: 5,
        mime_types_count: 2,
      },
      automation: {
        webdriver: false,
        globals: {
          "cdc_*": false,
          "__webdriver_*": false,
        },
      },
      environment: {
        timezone: "America/New_York",
        viewport: {
          width: 1440,
          height: 900,
          device_scale_factor: 2,
        },
        screen: {
          width: 1440,
          height: 900,
          avail_width: 1440,
          avail_height: 875,
        },
        hardware_concurrency: 8,
        device_memory: 8,
      },
      rendering: {
        webgl: {
          status: "available",
          vendor: "WebKit",
          renderer: "WebKit WebGL",
          unmasked_vendor: "Apple",
          unmasked_renderer: "Apple GPU",
        },
        canvas: {
          status: "stable",
          hash: "abc123",
        },
      },
      storage: {
        cookies_enabled: true,
        local_storage: "available",
        session_storage: "available",
        indexed_db: "available",
        service_worker: "available",
      },
      permissions: {
        geolocation: "prompt",
        notifications: "prompt",
      },
      webrtc: {
        api_available: true,
        host_candidate_gathering: "absent",
        candidate_count: 0,
      },
      cdp: {
        product: "Chrome/147.0.0.0",
        protocol_version: "1.3",
        user_agent: "Mozilla/5.0",
      },
    },
    findings: [],
  };

  return {
    ...base,
    signals: {
      ...base.signals,
      identity: {
        ...base.signals.identity,
        ...overrides.identity,
      },
      automation: {
        ...base.signals.automation,
        ...overrides.automation,
      },
      environment: {
        ...base.signals.environment,
        viewport: {
          ...base.signals.environment.viewport,
          ...overrides.viewport,
        },
      },
      rendering: {
        webgl: {
          ...base.signals.rendering.webgl,
          ...overrides.rendering?.webgl,
        },
        canvas: {
          ...base.signals.rendering.canvas,
          ...overrides.rendering?.canvas,
        },
      },
      storage: {
        ...base.signals.storage,
        ...overrides.storage,
      },
      permissions: overrides.permissions ?? base.signals.permissions,
      webrtc: {
        ...base.signals.webrtc,
        ...overrides.webrtc,
      },
      cdp: {
        ...base.signals.cdp,
        ...overrides.cdp,
      },
    },
  };
}
