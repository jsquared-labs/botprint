import { EXIT_CODES } from "./exit-codes";
import { BotprintError } from "./errors";
import { stringValue } from "./coerce";

type JsonObject = Record<string, unknown>;

const TEXT_DECODER = new TextDecoder();

type PendingRequest = {
  resolve: (value: JsonObject) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const BunWebSocket = WebSocket as unknown as {
  new (url: string, options?: Bun.WebSocketOptions): WebSocket;
};

type CdpResponse = {
  id?: number;
  result?: JsonObject;
  error?: {
    code: number;
    message: string;
  };
};

export type CdpClient = {
  send(method: string, params?: JsonObject, sessionId?: string): Promise<JsonObject>;
  close(): void;
};

export type BrowserVersion = {
  product: string;
  protocolVersion: string;
  userAgent: string;
};

export type CdpTarget = {
  targetId: string;
  type: string;
  title: string;
  url: string;
  attached: boolean;
};

export async function discoverWebSocketUrl(endpoint: string, headers: Record<string, string>): Promise<string> {
  const url = new URL(endpoint);

  if (url.protocol === "ws:" || url.protocol === "wss:") {
    return endpoint;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BotprintError(`Unsupported CDP endpoint protocol: ${url.protocol}`, EXIT_CODES.usage);
  }

  const versionUrl = new URL("/json/version", endpoint);
  const response = await fetchCdp(versionUrl, headers, "CDP discovery");
  if (!response.ok) {
    throw new BotprintError(`CDP discovery failed at ${versionUrl.href}: HTTP ${response.status}`, EXIT_CODES.cdpConnectivity);
  }

  const body = (await readJson(response, "CDP discovery")) as { webSocketDebuggerUrl?: unknown };
  if (typeof body.webSocketDebuggerUrl === "string") {
    return body.webSocketDebuggerUrl;
  }

  const listUrl = new URL("/json/list", endpoint);
  const listResponse = await fetchCdp(listUrl, headers, "CDP target discovery");
  if (!listResponse.ok) {
    throw new BotprintError(`CDP target discovery failed at ${listUrl.href}: HTTP ${listResponse.status}`, EXIT_CODES.cdpConnectivity);
  }

  const targets = (await readJson(listResponse, "CDP target discovery")) as Array<{ webSocketDebuggerUrl?: unknown }>;
  const target = targets.find((candidate) => typeof candidate.webSocketDebuggerUrl === "string");
  const targetWebSocketUrl = target?.webSocketDebuggerUrl;
  if (typeof targetWebSocketUrl !== "string") {
    throw new BotprintError("CDP endpoint did not expose a WebSocket debugger URL.", EXIT_CODES.cdpConnectivity);
  }

  return targetWebSocketUrl;
}

export function connectCdp(webSocketUrl: string, headers: Record<string, string>, timeoutMs: number): Promise<CdpClient> {
  return new Promise((resolve, reject) => {
    const pending = new Map<number, PendingRequest>();
    let nextId = 1;
    let settled = false;

    let socket: WebSocket;
    try {
      socket = new BunWebSocket(webSocketUrl, { headers });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      reject(new BotprintError(`Failed to construct CDP WebSocket for ${webSocketUrl}: ${detail}`, EXIT_CODES.cdpConnectivity));
      return;
    }

    const connectTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.close();
        reject(new BotprintError(`Timed out connecting to CDP WebSocket: ${webSocketUrl}`, EXIT_CODES.cdpConnectivity));
      }
    }, timeoutMs);

    socket.addEventListener("open", () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(connectTimer);

      resolve({
        send(method: string, params: JsonObject = {}, sessionId?: string): Promise<JsonObject> {
          if (socket.readyState !== WebSocket.OPEN) {
            return Promise.reject(new BotprintError("CDP WebSocket is not open.", EXIT_CODES.cdpConnectivity));
          }

          const id = nextId;
          nextId += 1;

          const message: JsonObject = { id, method, params };
          if (sessionId !== undefined) {
            message.sessionId = sessionId;
          }

          return new Promise((requestResolve, requestReject) => {
            const timer = setTimeout(() => {
              pending.delete(id);
              requestReject(new BotprintError(`Timed out waiting for CDP method ${method}.`, EXIT_CODES.cdpConnectivity));
            }, timeoutMs);

            pending.set(id, { resolve: requestResolve, reject: requestReject, timer });
            socket.send(JSON.stringify(message));
          });
        },

        close(): void {
          for (const request of pending.values()) {
            clearTimeout(request.timer);
            request.reject(new BotprintError("CDP WebSocket closed.", EXIT_CODES.cdpConnectivity));
          }
          pending.clear();
          socket.close();
        },
      });
    });

    socket.addEventListener("error", () => {
      if (!settled) {
        settled = true;
        clearTimeout(connectTimer);
        reject(new BotprintError(`Failed to connect to CDP WebSocket: ${webSocketUrl}`, EXIT_CODES.cdpConnectivity));
      }
    });

    socket.addEventListener("close", () => {
      if (!settled) {
        settled = true;
        clearTimeout(connectTimer);
        reject(new BotprintError(`CDP WebSocket closed before connection opened: ${webSocketUrl}`, EXIT_CODES.cdpConnectivity));
        return;
      }
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new BotprintError("CDP WebSocket closed before a response arrived.", EXIT_CODES.cdpConnectivity));
      }
      pending.clear();
    });

    socket.addEventListener("message", async (event) => {
      const response = parseResponse(await messageDataToString(event.data));
      if (response.id === undefined) {
        return;
      }

      const request = pending.get(response.id);
      if (request === undefined) {
        return;
      }

      pending.delete(response.id);
      clearTimeout(request.timer);

      if (response.error !== undefined) {
        request.reject(new BotprintError(`CDP error ${response.error.code}: ${response.error.message}`, EXIT_CODES.cdpConnectivity));
        return;
      }

      request.resolve(response.result ?? {});
    });
  });
}

export async function getBrowserVersion(client: CdpClient): Promise<BrowserVersion> {
  const version = await client.send("Browser.getVersion");
  return {
    product: stringValue(version.product),
    protocolVersion: stringValue(version.protocolVersion),
    userAgent: stringValue(version.userAgent),
  };
}

export async function getTargets(client: CdpClient): Promise<CdpTarget[]> {
  const result = await client.send("Target.getTargets");
  const rawTargets = Array.isArray(result.targetInfos) ? result.targetInfos : [];
  return rawTargets.map(readTargetInfo);
}

function readTargetInfo(value: unknown): CdpTarget {
  const target = typeof value === "object" && value !== null ? (value as JsonObject) : {};
  return {
    targetId: stringValue(target.targetId),
    type: stringValue(target.type),
    title: stringValue(target.title),
    url: stringValue(target.url),
    attached: target.attached === true,
  };
}

async function messageDataToString(data: unknown): Promise<string> {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof Blob) {
    return data.text();
  }
  if (data instanceof ArrayBuffer) {
    return TEXT_DECODER.decode(data);
  }
  if (ArrayBuffer.isView(data)) {
    return TEXT_DECODER.decode(data);
  }
  return String(data);
}

function parseResponse(raw: string): CdpResponse {
  try {
    return JSON.parse(raw) as CdpResponse;
  } catch {
    return {};
  }
}

async function fetchCdp(url: URL, headers: Record<string, string>, operation: string): Promise<Response> {
  try {
    return await fetch(url, { headers });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new BotprintError(`${operation} failed at ${url.href}: ${detail}`, EXIT_CODES.cdpConnectivity);
  }
}

async function readJson(response: Response, operation: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new BotprintError(`${operation} returned invalid JSON.`, EXIT_CODES.cdpConnectivity);
  }
}
