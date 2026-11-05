import { SCHEMA_VERSION, type BotprintProfile } from "../../src/profile";
import { BOTPRINT_VERSION } from "../../src/version";

type Overrides = {
  source?: Partial<BotprintProfile["source"]>;
  automation?: Partial<BotprintProfile["signals"]["automation"]>;
  identity?: Partial<BotprintProfile["signals"]["identity"]>;
  viewport?: Partial<BotprintProfile["signals"]["environment"]["viewport"]>;
  environment?: Partial<Omit<BotprintProfile["signals"]["environment"], "viewport">>;
  rendering?: {
    webgl?: Partial<BotprintProfile["signals"]["rendering"]["webgl"]>;
    canvas?: Partial<BotprintProfile["signals"]["rendering"]["canvas"]>;
    audio?: Partial<BotprintProfile["signals"]["rendering"]["audio"]>;
    fonts?: Partial<BotprintProfile["signals"]["rendering"]["fonts"]>;
  };
  storage?: Partial<BotprintProfile["signals"]["storage"]>;
  permissions?: BotprintProfile["signals"]["permissions"];
  webrtc?: Partial<BotprintProfile["signals"]["webrtc"]>;
  http?: BotprintProfile["signals"]["http"] | null;
  cdp?: Partial<BotprintProfile["signals"]["cdp"]>;
};

export const FIXTURE_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

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
      browser_context_id: "CONTEXT_1",
      browser_context_source: "page-target",
      probe_timeout_ms: 2000,
      ...overrides.source,
    },
    signals: {
      identity: {
        user_agent: FIXTURE_USER_AGENT,
        user_agent_data: {
          brands: [
            { brand: "Chromium", version: "147" },
            { brand: "Google Chrome", version: "147" },
            { brand: "Not_A Brand", version: "8" },
          ],
          mobile: false,
          platform: "macOS",
        },
        platform: "MacIntel",
        language: "en-US",
        languages: ["en-US", "en"],
        plugins_count: 5,
        mime_types_count: 2,
        pdf_viewer_enabled: true,
      },
      automation: {
        webdriver: false,
        chrome_object: true,
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
        outer_window: {
          width: 1440,
          height: 980,
        },
        screen: {
          width: 1440,
          height: 900,
          avail_width: 1440,
          avail_height: 875,
          color_depth: 30,
        },
        hardware_concurrency: 8,
        device_memory: 8,
        speech_voices_count: 12,
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
        audio: {
          status: "available",
          hash: "audio123",
        },
        fonts: {
          status: "available",
          checked: 31,
          detected: ["Arial", "Georgia", "Helvetica", "Menlo", "Verdana"],
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
        notification_api: "prompt",
      },
      webrtc: {
        api_available: true,
        host_candidate_gathering: "absent",
        candidate_count: 0,
      },
      http: {
        status: "captured",
        request_headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.9",
          "sec-ch-ua": '"Chromium";v="147", "Google Chrome";v="147"',
          "user-agent": FIXTURE_USER_AGENT,
        },
      },
      cdp: {
        product: "Chrome/147.0.0.0",
        protocol_version: "1.3",
        user_agent: FIXTURE_USER_AGENT,
      },
    },
    findings: [],
  };

  const http = overrides.http === null ? undefined : (overrides.http ?? base.signals.http);
  const { http: _baseHttp, ...baseSignals } = base.signals;

  return {
    ...base,
    signals: {
      ...baseSignals,
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
        ...overrides.environment,
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
        audio: {
          ...base.signals.rendering.audio,
          ...overrides.rendering?.audio,
        },
        fonts: {
          ...base.signals.rendering.fonts,
          ...overrides.rendering?.fonts,
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
      ...(http === undefined ? {} : { http }),
      cdp: {
        ...base.signals.cdp,
        ...overrides.cdp,
      },
    },
  };
}
