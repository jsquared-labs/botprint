import { describe, expect, test } from "bun:test";
import { discoverWebSocketUrl, getTargets, type CdpClient } from "../src/cdp";

describe("discoverWebSocketUrl", () => {
  test("returns ws and wss endpoints unchanged", async () => {
    await expect(discoverWebSocketUrl("ws://localhost/devtools/browser/1", {})).resolves.toBe("ws://localhost/devtools/browser/1");
    await expect(discoverWebSocketUrl("wss://example.test/devtools/browser/1", {})).resolves.toBe("wss://example.test/devtools/browser/1");
  });

  test("discovers browser websocket URL from /json/version", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/json/version") {
          return Response.json({ webSocketDebuggerUrl: "ws://example.test/devtools/browser/version" });
        }
        return new Response("not found", { status: 404 });
      },
    });

    try {
      await expect(discoverWebSocketUrl(server.url.href, {})).resolves.toBe("ws://example.test/devtools/browser/version");
    } finally {
      server.stop(true);
    }
  });

  test("falls back to /json/list when /json/version has no websocket URL", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/json/version") {
          return Response.json({});
        }
        if (url.pathname === "/json/list") {
          return Response.json([{ webSocketDebuggerUrl: "ws://example.test/devtools/page/1" }]);
        }
        return new Response("not found", { status: 404 });
      },
    });

    try {
      await expect(discoverWebSocketUrl(server.url.href, {})).resolves.toBe("ws://example.test/devtools/page/1");
    } finally {
      server.stop(true);
    }
  });
});

describe("getTargets", () => {
  test("normalizes CDP target info", async () => {
    const client: CdpClient = {
      async send(method) {
        expect(method).toBe("Target.getTargets");
        return {
          targetInfos: [
            {
              targetId: "page-1",
              type: "page",
              title: "Example",
              url: "https://example.test/",
              attached: true,
              browserContextId: "CTX1",
            },
            {
              targetId: "worker-1",
              type: "service_worker",
              title: "Worker",
              url: "https://example.test/sw.js",
              attached: false,
            },
          ],
        };
      },
      close() {},
    };

    await expect(getTargets(client)).resolves.toEqual([
      {
        targetId: "page-1",
        type: "page",
        title: "Example",
        url: "https://example.test/",
        attached: true,
        browserContextId: "CTX1",
      },
      {
        targetId: "worker-1",
        type: "service_worker",
        title: "Worker",
        url: "https://example.test/sw.js",
        attached: false,
      },
    ]);
  });
});
