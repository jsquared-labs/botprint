import { describe, expect, test } from "bun:test";
import { EXIT_CODES } from "../src/exit-codes";
import { BotprintError } from "../src/errors";
import { endpointKind } from "../src/profile";
import { browserDiagnosticUrl, parseHeaderLines, selectTarget } from "../src/run";
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
