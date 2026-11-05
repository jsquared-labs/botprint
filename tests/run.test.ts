import { describe, expect, test } from "bun:test";
import { EXIT_CODES } from "../src/exit-codes";
import { BotprintError } from "../src/errors";
import { endpointKind } from "../src/profile";
import { browserDiagnosticUrl, captureRequestHeaders, parseHeaderLines, rejectedContextError, selectBrowserContext, selectTarget } from "../src/run";
import type { CdpTarget } from "../src/cdp";

describe("parseHeaderLines", () => {
  test("parses repeatable header lines", () => {
    expect(parseHeaderLines(["Authorization: Bearer token", "X-Trace: abc:def"])).toEqual({
      Authorization: "Bearer token",
      "X-Trace": "abc:def",
    });
  });

  test("rejects malformed header lines as usage errors", () => {
    expect(() => parseHeaderLines(["Authorization"])).toThrow(BotprintError);

    try {
      parseHeaderLines(["Authorization"]);
      throw new Error("expected parseHeaderLines to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BotprintError);
      if (error instanceof BotprintError) {
        expect(error.exitCode).toBe(EXIT_CODES.usage);
      }
    }
  });
});

describe("browserDiagnosticUrl", () => {
  test("uses server URL by default", () => {
    expect(browserDiagnosticUrl(new URL("http://127.0.0.1:5000/"), undefined)).toBe("http://127.0.0.1:5000/");
  });

  test("replaces hostname for browsers outside the host namespace", () => {
    expect(browserDiagnosticUrl(new URL("http://0.0.0.0:5000/"), "host.docker.internal")).toBe("http://host.docker.internal:5000/");
  });
});

describe("endpointKind", () => {
  test("classifies CDP endpoint protocols", () => {
    expect(endpointKind("http://localhost:9222")).toBe("http");
    expect(endpointKind("https://browser.example")).toBe("https");
    expect(endpointKind("ws://localhost/devtools/browser/1")).toBe("ws");
    expect(endpointKind("wss://browser.example/devtools/browser/1")).toBe("wss");
  });
});

describe("selectTarget", () => {
  const targets: CdpTarget[] = [
    {
      targetId: "page-1",
      type: "page",
      title: "Example",
      url: "https://example.test/app",
      attached: false,
    },
    {
      targetId: "page-2",
      type: "page",
      title: "Example Settings",
      url: "https://example.test/settings",
      attached: false,
    },
    {
      targetId: "worker-1",
      type: "service_worker",
      title: "Worker",
      url: "https://example.test/sw.js",
      attached: false,
    },
  ];

  test("selects exact page target ids", () => {
    expect(selectTarget(targets, { target: "page-1", targetUrl: undefined }).targetId).toBe("page-1");
  });

  test("rejects missing target ids as usage errors", () => {
    expectBotprintUsageError(() => selectTarget(targets, { target: "missing", targetUrl: undefined }), "No CDP page target found with targetId missing.");
  });

  test("rejects non-page target ids as usage errors", () => {
    expectBotprintUsageError(() => selectTarget(targets, { target: "worker-1", targetUrl: undefined }), "Target worker-1 has type service_worker; only page targets are supported.");
  });

  test("resolves target URLs when exactly one page target matches", () => {
    expect(selectTarget(targets, { target: undefined, targetUrl: "https://example.test/app" }).targetId).toBe("page-1");
  });

  test("rejects missing target URL matches", () => {
    expectBotprintUsageError(
      () => selectTarget(targets, { target: undefined, targetUrl: "https://missing.test" }),
      "--target-url https://missing.test must resolve to exactly one page target; found 0: no matches",
    );
  });

  test("rejects ambiguous target URL matches with candidates", () => {
    expectBotprintUsageError(
      () => selectTarget(targets, { target: undefined, targetUrl: "https://example.test" }),
      "--target-url https://example.test must resolve to exactly one page target; found 2: page-1 https://example.test/app; page-2 https://example.test/settings",
    );
  });
});

function expectBotprintUsageError(fn: () => unknown, message: string): void {
  try {
    fn();
    throw new Error("expected function to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(BotprintError);
    if (error instanceof BotprintError) {
      expect(error.exitCode).toBe(EXIT_CODES.usage);
      expect(error.message).toBe(message);
    }
  }
}

describe("selectBrowserContext", () => {
  const page = (targetId: string, browserContextId: string | undefined, type = "page"): CdpTarget => ({
    targetId,
    type,
    title: "",
    url: "about:blank",
    attached: false,
    ...(browserContextId === undefined ? {} : { browserContextId }),
  });

  test("uses the context of the first page target by default", () => {
    expect(selectBrowserContext([page("p1", "C1"), page("p2", "C1")], undefined)).toEqual({ browserContextId: "C1", source: "page-target", warnings: [] });
  });

  test("warns when page targets span multiple contexts", () => {
    expect(selectBrowserContext([page("p1", "C1"), page("p2", "C2")], undefined)).toEqual({ browserContextId: "C1", source: "page-target", warnings: ["multiple-browser-contexts"] });
  });

  test("falls back to the browser default context when no page targets exist", () => {
    expect(selectBrowserContext([page("w1", "C1", "service_worker")], undefined)).toEqual({ browserContextId: undefined, source: "browser-default", warnings: ["default-browser-context"] });
    expect(selectBrowserContext([], undefined)).toEqual({ browserContextId: undefined, source: "browser-default", warnings: ["default-browser-context"] });
  });

  test("honours explicit --context values", () => {
    expect(selectBrowserContext([page("p1", "C1")], "default")).toEqual({ browserContextId: undefined, source: "browser-default", warnings: [] });
    expect(selectBrowserContext([page("p1", "C1")], "C9")).toEqual({ browserContextId: "C9", source: "explicit", warnings: [] });
  });
});

describe("captureRequestHeaders", () => {
  test("keeps allowlisted headers and drops cookies, authorization, and host", () => {
    const headers = new Headers({
      Host: "127.0.0.1:1234",
      Cookie: "session=secret",
      Authorization: "Bearer secret",
      "Accept-Language": "en-GB,en;q=0.9",
      "Sec-CH-UA": '"Chromium";v="153"',
      "User-Agent": "Mozilla/5.0",
      "X-Custom": "nope",
    });

    expect(captureRequestHeaders(headers)).toEqual({
      "accept-language": "en-GB,en;q=0.9",
      "sec-ch-ua": '"Chromium";v="153"',
      "user-agent": "Mozilla/5.0",
    });
  });
});

describe("rejectedContextError", () => {
  const explicit = { browserContextId: "C9", source: "explicit" as const, warnings: [] };
  const unknownContext = new BotprintError("CDP error -32602: Failed to find browser context with id C9", EXIT_CODES.cdpConnectivity);

  test("maps an unknown explicit --context id to a usage error", () => {
    const error = rejectedContextError(unknownContext, explicit);
    expect(error).toBeInstanceOf(BotprintError);
    expect(error?.exitCode).toBe(EXIT_CODES.usage);
    expect(error?.message).toBe("--context C9 was rejected by the browser: CDP error -32602: Failed to find browser context with id C9. List context IDs with `botprint targets --cdp <url> --json`.");
  });

  test("leaves other failures and non-explicit contexts untouched", () => {
    expect(rejectedContextError(new BotprintError("CDP WebSocket closed.", EXIT_CODES.cdpConnectivity), explicit)).toBeUndefined();
    expect(rejectedContextError(unknownContext, { browserContextId: "C1", source: "page-target", warnings: [] })).toBeUndefined();
  });
});
