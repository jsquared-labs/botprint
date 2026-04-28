import { EXIT_CODES } from "./exit-codes";
import { BotprintError } from "./errors";
import type { BrowserVersion, CdpClient } from "./cdp";
import { booleanOrNull, isObject, numberValue, stringArray, stringValue } from "./coerce";

const SMOKE_PROBE_EXPRESSION = `(() => {
  const availability = (fn) => {
    try {
      return fn() ? "available" : "unavailable";
    } catch {
      return "error";
    }
  };

  const storageAvailable = (kind) => availability(() => {
    const storage = window[kind];
    const key = "__botprint_probe__";
    storage.setItem(key, "1");
    storage.removeItem(key);
    return true;
  });

  const indexedDbAvailable = () => new Promise((resolve) => {
    if (!("indexedDB" in window)) {
      resolve("unavailable");
      return;
    }

    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    try {
      const request = indexedDB.open("__botprint_probe__", 1);
      const timer = setTimeout(() => finish("error"), 500);
      request.onerror = () => {
        clearTimeout(timer);
        finish("error");
      };
      request.onblocked = () => {
        clearTimeout(timer);
        finish("error");
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        request.result.close();
        indexedDB.deleteDatabase("__botprint_probe__");
        finish("available");
      };
    } catch {
      finish("error");
    }
  });

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

  const hashString = (value) => {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }
    return (hash >>> 0).toString(16);
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

  const webrtcSignals = () => new Promise((resolve) => {
    const Ctor = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (!Ctor) {
      resolve({ apiAvailable: false, hostCandidateGathering: "unsupported", candidateCount: 0 });
      return;
    }

    let pc;
    let candidateCount = 0;
    let settled = false;
    const finish = (status) => {
      if (!settled) {
        settled = true;
        if (pc) {
          pc.close();
        }
        resolve({ apiAvailable: true, hostCandidateGathering: status, candidateCount });
      }
    };

    try {
      pc = new Ctor({ iceServers: [] });
      pc.createDataChannel("__botprint_probe__");
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          candidateCount += 1;
        }
      };
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => setTimeout(() => finish(candidateCount > 0 ? "present" : "absent"), 300))
        .catch(() => finish("error"));
    } catch {
      finish("error");
    }
  });

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

  const permissions = {};
  const permissionNames = ["geolocation", "notifications", "camera", "microphone"];
  const collectPermissions = async () => {
    for (const name of permissionNames) {
      permissions[name] = await queryPermission(name);
    }
  };

  return Promise.all([indexedDbAvailable(), collectPermissions(), webrtcSignals()]).then(([indexedDb, _permissions, webrtc]) => ({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    languages: Array.from(navigator.languages || []),
    webdriver: typeof navigator.webdriver === "boolean" ? navigator.webdriver : null,
    automationGlobals,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      deviceScaleFactor: window.devicePixelRatio
    },
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight
    },
    hardwareConcurrency: typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : 0,
    deviceMemory: typeof navigator.deviceMemory === "number" ? navigator.deviceMemory : null,
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
      canvas: canvasSignals()
    },
    webrtc,
    href: location.href
  }));
})()`;

type ProbeResult = {
  userAgent: string;
  platform: string;
  languages: string[];
  webdriver: boolean | null;
  automationGlobals: Record<string, boolean>;
  timezone: string;
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
  };
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
  };
  hardwareConcurrency: number;
  deviceMemory: number | null;
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

export async function runDiagnosticProbe(client: CdpClient, browserVersion: BrowserVersion, diagnosticUrl: string): Promise<ProbeRunResult> {
  const target = await client.send("Target.createTarget", { url: diagnosticUrl });
  const targetId = readString(target.targetId, "Target.createTarget did not return targetId.");

  try {
    return await runExistingTargetProbe(client, browserVersion, targetId);
  } finally {
    await ignoreCdpCloseError(client.send("Target.closeTarget", { targetId }));
  }
}

export async function runExistingTargetProbe(client: CdpClient, browserVersion: BrowserVersion, targetId: string): Promise<ProbeRunResult> {
  let sessionId: string | undefined;
  try {
    const attached = await client.send("Target.attachToTarget", { targetId, flatten: true });
    sessionId = readString(attached.sessionId, "Target.attachToTarget did not return sessionId.");

    await client.send("Runtime.enable", {}, sessionId);

    const evaluated = await client.send(
      "Runtime.evaluate",
      {
        expression: SMOKE_PROBE_EXPRESSION,
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
    throw new BotprintError("Smoke probe threw an exception in the browser.", EXIT_CODES.probeFailure);
  }

  const result = evaluated.result;
  if (!isObject(result)) {
    throw new BotprintError("Runtime.evaluate did not return a result object.", EXIT_CODES.probeFailure);
  }

  const value = result.value;
  if (!isObject(value)) {
    throw new BotprintError("Smoke probe did not return a JSON object.", EXIT_CODES.probeFailure);
  }

  const viewport = isObject(value.viewport) ? value.viewport : {};

  return {
    userAgent: stringValue(value.userAgent),
    platform: stringValue(value.platform),
    languages: stringArray(value.languages),
    webdriver: booleanOrNull(value.webdriver),
    automationGlobals: booleanRecord(value.automationGlobals),
    timezone: stringValue(value.timezone),
    viewport: {
      width: numberValue(viewport.width),
      height: numberValue(viewport.height),
      deviceScaleFactor: numberValue(viewport.deviceScaleFactor),
    },
    screen: readScreen(value.screen),
    hardwareConcurrency: numberValue(value.hardwareConcurrency),
    deviceMemory: typeof value.deviceMemory === "number" ? numberValue(value.deviceMemory) : null,
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

function readScreen(value: unknown): ProbeResult["screen"] {
  const screen = isObject(value) ? value : {};
  return {
    width: numberValue(screen.width),
    height: numberValue(screen.height),
    availWidth: numberValue(screen.availWidth),
    availHeight: numberValue(screen.availHeight),
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
  return {
    webgl: isObject(rendering.webgl) ? rendering.webgl : {},
    canvas: isObject(rendering.canvas) ? rendering.canvas : {},
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
