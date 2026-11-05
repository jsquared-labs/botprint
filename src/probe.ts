import { EXIT_CODES } from "./exit-codes";
import { BotprintError } from "./errors";
import type { BrowserVersion, CdpClient } from "./cdp";
import { booleanOrNull, isObject, numberValue, stringArray, stringValue } from "./coerce";

export const DEFAULT_PROBE_TIMEOUT_MS = 2_000;
export const SPEECH_VOICES_WAIT_MS = 500;

// Fonts are checked by name against three generic fallback families; a font counts as
// detected when its rendered width differs from at least one fallback. The list mixes common
// Windows, macOS, and Linux faces so local-vs-Docker drift shows up as a changed set.
export const FONT_CHECK_LIST = [
  "Arial",
  "Arial Black",
  "Calibri",
  "Cambria",
  "Cantarell",
  "Comic Sans MS",
  "Consolas",
  "Courier New",
  "DejaVu Sans",
  "DejaVu Serif",
  "Fira Sans",
  "Georgia",
  "Helvetica",
  "Helvetica Neue",
  "Impact",
  "Inter",
  "Liberation Sans",
  "Liberation Serif",
  "Lucida Grande",
  "Menlo",
  "Monaco",
  "Noto Sans",
  "Noto Serif",
  "Open Sans",
  "Roboto",
  "Segoe UI",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Ubuntu",
  "Verdana",
];

export function buildProbeExpression(timeoutMs: number): string {
  const timeout = Number.isSafeInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_PROBE_TIMEOUT_MS;
  return `(() => {
  const PROBE_TIMEOUT_MS = ${timeout};
  const SPEECH_VOICES_WAIT_MS = ${SPEECH_VOICES_WAIT_MS};
  const FONT_LIST = ${JSON.stringify(FONT_CHECK_LIST)};

  const availability = (fn) => {
    try {
      return fn() ? "available" : "unavailable";
    } catch {
      return "error";
    }
  };

  const withTimeout = (promise, onTimeout) => new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(onTimeout());
      }
    }, PROBE_TIMEOUT_MS);
    promise.then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(onTimeout("error"));
        }
      }
    );
  });

  const hashString = (value) => {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }
    return (hash >>> 0).toString(16);
  };

  const storageAvailable = (kind) => availability(() => {
    const storage = window[kind];
    const key = "__botprint_probe__";
    storage.setItem(key, "1");
    storage.removeItem(key);
    return true;
  });

  const indexedDbAvailable = () => {
    if (!("indexedDB" in window)) {
      return Promise.resolve("unavailable");
    }

    const open = new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open("__botprint_probe__", 1);
        request.onerror = () => reject(new Error("open failed"));
        request.onblocked = () => reject(new Error("open blocked"));
        request.onsuccess = () => {
          request.result.close();
          indexedDB.deleteDatabase("__botprint_probe__");
          resolve("available");
        };
      } catch (error) {
        reject(error);
      }
    });

    return withTimeout(open, (reason) => reason === "error" ? "error" : "timeout");
  };

  const queryPermission = async (name) => {
    if (!navigator.permissions || typeof navigator.permissions.query !== "function") {
      return "unsupported";
    }

    try {
      const result = await navigator.permissions.query({ name });
      return typeof result.state === "string" ? result.state : "unknown";
    } catch {
      return "error";
    }
  };

  const notificationApiPermission = () => {
    if (typeof Notification === "undefined" || typeof Notification.permission !== "string") {
      return "unsupported";
    }
    return Notification.permission === "default" ? "prompt" : Notification.permission;
  };

  const webglSignals = () => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) {
        return { status: "unavailable" };
      }

      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      const out = {
        status: "available",
        vendor: String(gl.getParameter(gl.VENDOR) || ""),
        renderer: String(gl.getParameter(gl.RENDERER) || "")
      };

      if (debugInfo) {
        out.unmaskedVendor = String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "");
        out.unmaskedRenderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "");
      }

      return out;
    } catch {
      return { status: "error" };
    }
  };

  const canvasSignals = () => {
    try {
      const draw = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 240;
        canvas.height = 80;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return null;
        }

        ctx.textBaseline = "top";
        ctx.fillStyle = "#f60";
        ctx.fillRect(8, 8, 96, 32);
        ctx.fillStyle = "#069";
        ctx.font = "16px Arial";
        ctx.fillText("Botprint canvas sample", 12, 16);
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = "rgba(0, 128, 255, 0.65)";
        ctx.arc(64, 48, 24, 0, Math.PI * 2);
        ctx.fill();
        return canvas.toDataURL();
      };

      const first = draw();
      const second = draw();
      if (!first || !second) {
        return { status: "unavailable" };
      }
      if (first !== second) {
        return { status: "unstable" };
      }
      return { status: "stable", hash: hashString(first) };
    } catch {
      return { status: "error" };
    }
  };

  const audioSignals = () => {
    const Ctor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctor) {
      return Promise.resolve({ status: "unavailable" });
    }

    const render = new Promise((resolve, reject) => {
      try {
        const context = new Ctor(1, 4096, 44100);
        const oscillator = context.createOscillator();
        oscillator.type = "triangle";
        oscillator.frequency.value = 10000;
        const compressor = context.createDynamicsCompressor();
        oscillator.connect(compressor);
        compressor.connect(context.destination);
        oscillator.start(0);
        context.oncomplete = (event) => {
          const samples = event.renderedBuffer.getChannelData(0);
          let sum = 0;
          for (let index = 0; index < samples.length; index += 1) {
            sum += Math.abs(samples[index]);
          }
          resolve({ status: "available", hash: hashString(sum.toFixed(6)) });
        };
        context.startRendering();
      } catch (error) {
        reject(error);
      }
    });

    return withTimeout(render, (reason) => ({ status: reason === "error" ? "error" : "timeout" }));
  };

  const fontSignals = () => {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return { status: "unavailable", checked: 0, detected: [] };
      }

      const sample = "mmmmmmmmmmlliWWW@0123456789";
      const fallbacks = ["monospace", "sans-serif", "serif"];
      const widthFor = (family) => {
        ctx.font = "72px " + family;
        return ctx.measureText(sample).width;
      };
      const baseWidths = fallbacks.map(widthFor);
      const detected = [];
      for (const font of FONT_LIST) {
        const differs = fallbacks.some((fallback, index) => widthFor('"' + font + '", ' + fallback) !== baseWidths[index]);
        if (differs) {
          detected.push(font);
        }
      }
      return { status: "available", checked: FONT_LIST.length, detected };
    } catch {
      return { status: "error", checked: 0, detected: [] };
    }
  };

  const webrtcSignals = () => {
    const Ctor = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (!Ctor) {
      return Promise.resolve({ apiAvailable: false, hostCandidateGathering: "unsupported", candidateCount: 0 });
    }

    let pc;
    let candidateCount = 0;
    const gather = new Promise((resolve, reject) => {
      try {
        pc = new Ctor({ iceServers: [] });
        pc.createDataChannel("__botprint_probe__");
        // Resolve on the first candidate: the question is whether host candidates are gathered
        // at all, and Chromium can hold iceGatheringState at "gathering" for seconds afterwards.
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            candidateCount += 1;
            resolve("present");
          } else {
            resolve(candidateCount > 0 ? "present" : "absent");
          }
        };
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === "complete") {
            resolve(candidateCount > 0 ? "present" : "absent");
          }
        };
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .catch(reject);
      } catch (error) {
        reject(error);
      }
    });

    return withTimeout(gather, (reason) => {
      if (reason === "error") return "error";
      return candidateCount > 0 ? "present" : "timeout";
    }).then((status) => {
      if (pc) {
        try { pc.close(); } catch {}
      }
      return { apiAvailable: true, hostCandidateGathering: status, candidateCount };
    });
  };

  const automationNames = [
    "$cdc_asdjflasutopfhvcZLmcfl_",
    "_phantom",
    "__nightmare",
    "domAutomation",
    "domAutomationController"
  ];
  const windowNames = Object.getOwnPropertyNames(window);
  const automationGlobals = {
    "cdc_*": windowNames.some((name) => name.startsWith("cdc_")),
    "__webdriver_*": windowNames.some((name) => name.startsWith("__webdriver_"))
  };
  for (const name of automationNames) {
    automationGlobals[name] = Object.prototype.hasOwnProperty.call(window, name);
  }

  const userAgentData = () => {
    const data = navigator.userAgentData;
    if (!data || !Array.isArray(data.brands)) {
      return null;
    }
    return {
      brands: data.brands.map((entry) => ({ brand: String(entry.brand || ""), version: String(entry.version || "") })),
      mobile: data.mobile === true,
      platform: String(data.platform || "")
    };
  };

  const permissions = {};
  const permissionNames = ["geolocation", "notifications", "camera", "microphone"];
  const collectPermissions = async () => {
    for (const name of permissionNames) {
      permissions[name] = await queryPermission(name);
    }
    permissions.notification_api = notificationApiPermission();
  };

  // Chromium loads speech voices asynchronously: the first getVoices() call can return an
  // empty list and fire voiceschanged shortly after. Wait for that event, bounded so headless
  // environments with no voices do not stall the probe.
  const speechVoicesCount = () => new Promise((resolve) => {
    if (typeof speechSynthesis === "undefined" || typeof speechSynthesis.getVoices !== "function") {
      resolve(0);
      return;
    }
    try {
      const initial = speechSynthesis.getVoices().length;
      if (initial > 0) {
        resolve(initial);
        return;
      }
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          try {
            resolve(speechSynthesis.getVoices().length);
          } catch {
            resolve(0);
          }
        }
      };
      speechSynthesis.addEventListener("voiceschanged", finish, { once: true });
      setTimeout(finish, Math.min(PROBE_TIMEOUT_MS, SPEECH_VOICES_WAIT_MS));
    } catch {
      resolve(0);
    }
  });

  return Promise.all([indexedDbAvailable(), collectPermissions(), webrtcSignals(), audioSignals(), speechVoicesCount()]).then(([indexedDb, _permissions, webrtc, audio, speechVoices]) => ({
    userAgent: navigator.userAgent,
    userAgentData: userAgentData(),
    platform: navigator.platform,
    language: navigator.language || "",
    languages: Array.from(navigator.languages || []),
    pdfViewerEnabled: typeof navigator.pdfViewerEnabled === "boolean" ? navigator.pdfViewerEnabled : null,
    webdriver: typeof navigator.webdriver === "boolean" ? navigator.webdriver : null,
    chromeObject: typeof window.chrome === "object" && window.chrome !== null,
    automationGlobals,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      deviceScaleFactor: window.devicePixelRatio
    },
    outerWindow: {
      width: window.outerWidth,
      height: window.outerHeight
    },
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
      colorDepth: window.screen.colorDepth
    },
    hardwareConcurrency: typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : 0,
    deviceMemory: typeof navigator.deviceMemory === "number" ? navigator.deviceMemory : null,
    speechVoicesCount: speechVoices,
    pluginsCount: navigator.plugins ? navigator.plugins.length : 0,
    mimeTypesCount: navigator.mimeTypes ? navigator.mimeTypes.length : 0,
    cookiesEnabled: navigator.cookieEnabled === true,
    storage: {
      localStorage: storageAvailable("localStorage"),
      sessionStorage: storageAvailable("sessionStorage"),
      indexedDb,
      serviceWorker: "serviceWorker" in navigator ? "available" : "unavailable"
    },
    permissions,
    rendering: {
      webgl: webglSignals(),
      canvas: canvasSignals(),
      audio,
      fonts: fontSignals()
    },
    webrtc,
    href: location.href
  }));
})()`;
}

export type ProbeResult = {
  userAgent: string;
  userAgentData: { brands: Array<{ brand: string; version: string }>; mobile: boolean; platform: string } | null;
  platform: string;
  language: string;
  languages: string[];
  pdfViewerEnabled: boolean | null;
  webdriver: boolean | null;
  chromeObject: boolean;
  automationGlobals: Record<string, boolean>;
  timezone: string;
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
  };
  outerWindow: {
    width: number;
    height: number;
  };
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
  };
  hardwareConcurrency: number;
  deviceMemory: number | null;
  speechVoicesCount: number;
  pluginsCount: number;
  mimeTypesCount: number;
  cookiesEnabled: boolean;
  storage: {
    localStorage: string;
    sessionStorage: string;
    indexedDb: string;
    serviceWorker: string;
  };
  permissions: Record<string, string>;
  rendering: {
    webgl: Record<string, unknown>;
    canvas: Record<string, unknown>;
    audio: Record<string, unknown>;
    fonts: { status: string; checked: number; detected: string[] };
  };
  webrtc: {
    apiAvailable: boolean;
    hostCandidateGathering: string;
    candidateCount: number;
  };
  href: string;
};

export type ProbeRunResult = {
  targetUrl: string;
  result: ProbeResult;
};

export type ProbeOptions = {
  timeoutMs: number;
  browserContextId?: string | undefined;
};

export async function runDiagnosticProbe(client: CdpClient, browserVersion: BrowserVersion, diagnosticUrl: string, options: ProbeOptions): Promise<ProbeRunResult> {
  const params: Record<string, unknown> = { url: diagnosticUrl };
  if (options.browserContextId !== undefined) {
    params.browserContextId = options.browserContextId;
  }
  const target = await client.send("Target.createTarget", params);
  const targetId = readString(target.targetId, "Target.createTarget did not return targetId.");

  try {
    return await runExistingTargetProbe(client, browserVersion, targetId, options);
  } finally {
    await ignoreCdpCloseError(client.send("Target.closeTarget", { targetId }));
  }
}

export async function runExistingTargetProbe(client: CdpClient, browserVersion: BrowserVersion, targetId: string, options: ProbeOptions): Promise<ProbeRunResult> {
  let sessionId: string | undefined;
  try {
    const attached = await client.send("Target.attachToTarget", { targetId, flatten: true });
    sessionId = readString(attached.sessionId, "Target.attachToTarget did not return sessionId.");

    await client.send("Runtime.enable", {}, sessionId);

    const evaluated = await client.send(
      "Runtime.evaluate",
      {
        expression: buildProbeExpression(options.timeoutMs),
        returnByValue: true,
        awaitPromise: true,
      },
      sessionId,
    );

    const result = readEvaluationValue(evaluated);
    return {
      targetUrl: result.href || "about:blank",
      result: {
        ...result,
        userAgent: result.userAgent || browserVersion.userAgent,
      },
    };
  } finally {
    if (sessionId !== undefined) {
      await ignoreCdpCloseError(client.send("Target.detachFromTarget", { sessionId }));
    }
  }
}

function readEvaluationValue(evaluated: Record<string, unknown>): ProbeResult {
  if (evaluated.exceptionDetails !== undefined) {
    const details = evaluated.exceptionDetails;
    const text = isObject(details) ? stringValue(details.text) : "";
    const exception = isObject(details) && isObject(details.exception) ? stringValue(details.exception.description) : "";
    const detail = [text, exception].filter((part) => part.length > 0).join(" ");
    throw new BotprintError(`Probe threw an exception in the browser${detail.length > 0 ? `: ${detail}` : "."}`, EXIT_CODES.probeFailure);
  }

  const result = evaluated.result;
  if (!isObject(result)) {
    throw new BotprintError("Runtime.evaluate did not return a result object.", EXIT_CODES.probeFailure);
  }

  const value = result.value;
  if (!isObject(value)) {
    throw new BotprintError("Probe did not return a JSON object.", EXIT_CODES.probeFailure);
  }

  const viewport = isObject(value.viewport) ? value.viewport : {};
  const outerWindow = isObject(value.outerWindow) ? value.outerWindow : {};

  return {
    userAgent: stringValue(value.userAgent),
    userAgentData: readUserAgentData(value.userAgentData),
    platform: stringValue(value.platform),
    language: stringValue(value.language),
    languages: stringArray(value.languages),
    pdfViewerEnabled: booleanOrNull(value.pdfViewerEnabled),
    webdriver: booleanOrNull(value.webdriver),
    chromeObject: value.chromeObject === true,
    automationGlobals: booleanRecord(value.automationGlobals),
    timezone: stringValue(value.timezone),
    viewport: {
      width: numberValue(viewport.width),
      height: numberValue(viewport.height),
      deviceScaleFactor: numberValue(viewport.deviceScaleFactor),
    },
    outerWindow: {
      width: numberValue(outerWindow.width),
      height: numberValue(outerWindow.height),
    },
    screen: readScreen(value.screen),
    hardwareConcurrency: numberValue(value.hardwareConcurrency),
    deviceMemory: typeof value.deviceMemory === "number" ? numberValue(value.deviceMemory) : null,
    speechVoicesCount: numberValue(value.speechVoicesCount),
    pluginsCount: numberValue(value.pluginsCount),
    mimeTypesCount: numberValue(value.mimeTypesCount),
    cookiesEnabled: value.cookiesEnabled === true,
    storage: readStorage(value.storage),
    permissions: stringRecord(value.permissions),
    rendering: readRendering(value.rendering),
    webrtc: readWebrtc(value.webrtc),
    href: stringValue(value.href),
  };
}

function readString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new BotprintError(message, EXIT_CODES.cdpConnectivity);
  }
  return value;
}

function readUserAgentData(value: unknown): ProbeResult["userAgentData"] {
  if (!isObject(value) || !Array.isArray(value.brands)) {
    return null;
  }
  return {
    brands: value.brands.filter(isObject).map((entry) => ({ brand: stringValue(entry.brand), version: stringValue(entry.version) })),
    mobile: value.mobile === true,
    platform: stringValue(value.platform),
  };
}

function readScreen(value: unknown): ProbeResult["screen"] {
  const screen = isObject(value) ? value : {};
  return {
    width: numberValue(screen.width),
    height: numberValue(screen.height),
    availWidth: numberValue(screen.availWidth),
    availHeight: numberValue(screen.availHeight),
    colorDepth: numberValue(screen.colorDepth),
  };
}

function readStorage(value: unknown): ProbeResult["storage"] {
  const storage = isObject(value) ? value : {};
  return {
    localStorage: stringValue(storage.localStorage),
    sessionStorage: stringValue(storage.sessionStorage),
    indexedDb: stringValue(storage.indexedDb),
    serviceWorker: stringValue(storage.serviceWorker),
  };
}

function readRendering(value: unknown): ProbeResult["rendering"] {
  const rendering = isObject(value) ? value : {};
  const fonts = isObject(rendering.fonts) ? rendering.fonts : {};
  return {
    webgl: isObject(rendering.webgl) ? rendering.webgl : {},
    canvas: isObject(rendering.canvas) ? rendering.canvas : {},
    audio: isObject(rendering.audio) ? rendering.audio : {},
    fonts: {
      status: stringValue(fonts.status),
      checked: numberValue(fonts.checked),
      detected: stringArray(fonts.detected),
    },
  };
}

function readWebrtc(value: unknown): ProbeResult["webrtc"] {
  const webrtc = isObject(value) ? value : {};
  return {
    apiAvailable: webrtc.apiAvailable === true,
    hostCandidateGathering: stringValue(webrtc.hostCandidateGathering),
    candidateCount: numberValue(webrtc.candidateCount),
  };
}

function booleanRecord(value: unknown): Record<string, boolean> {
  if (!isObject(value)) {
    return {};
  }

  const out: Record<string, boolean> = {};
  for (const [key, recordValue] of Object.entries(value)) {
    out[key] = recordValue === true;
  }
  return out;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isObject(value)) {
    return {};
  }

  const out: Record<string, string> = {};
  for (const [key, recordValue] of Object.entries(value)) {
    out[key] = stringValue(recordValue);
  }
  return out;
}

async function ignoreCdpCloseError(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    // Cleanup failure should not mask the probe result or original error.
  }
}
