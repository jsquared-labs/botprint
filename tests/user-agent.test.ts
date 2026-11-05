import { describe, expect, test } from "bun:test";
import { parseBrowserProduct, parseUserAgent } from "../src/user-agent";

describe("parseUserAgent", () => {
  test("parses Chrome, HeadlessChrome, Edge, Firefox, and Safari", () => {
    expect(parseUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36")).toEqual({ family: "Chrome", major: 153, headless: false });
    expect(parseUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36")).toEqual({ family: "HeadlessChrome", major: 153, headless: true });
    expect(parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0")).toEqual({ family: "Edge", major: 147, headless: false });
    expect(parseUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0")).toEqual({ family: "Firefox", major: 145, headless: false });
    expect(parseUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15")).toEqual({ family: "Safari", major: 18, headless: false });
  });

  test("falls back for unknown and empty strings", () => {
    expect(parseUserAgent("")).toEqual({ family: "unknown", major: undefined, headless: false });
    expect(parseUserAgent("curl/8.0")).toEqual({ family: "other", major: undefined, headless: false });
  });
});

describe("parseBrowserProduct", () => {
  test("separates headless mode from the binary family", () => {
    expect(parseBrowserProduct("HeadlessChrome/145.0.0.0")).toEqual({ family: "HeadlessChrome", binaryFamily: "Chrome", major: 145, headless: true });
    expect(parseBrowserProduct("Chrome/147.0.0.0")).toEqual({ family: "Chrome", binaryFamily: "Chrome", major: 147, headless: false });
    expect(parseBrowserProduct("Firefox")).toEqual({ family: "Firefox", binaryFamily: "Firefox", major: undefined, headless: false });
  });
});
