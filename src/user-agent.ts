export type ParsedUserAgent = {
  family: string;
  major: number | undefined;
  headless: boolean;
};

const FAMILY_PATTERNS: Array<[string, RegExp]> = [
  ["HeadlessChrome", /HeadlessChrome\/(\d+)/],
  ["Edge", /Edg(?:e|A|iOS)?\/(\d+)/],
  ["Chrome", /(?:Chrome|CriOS)\/(\d+)/],
  ["Firefox", /Firefox\/(\d+)/],
  ["Safari", /Version\/(\d+)[^ ]* Safari\//],
];

// Parses the browser family and major version out of a user agent string so comparisons can
// ignore build-number noise (Chrome's reduced UA reports 0.0.0 for minor versions while the
// headless shell reports the full build).
export function parseUserAgent(userAgent: string): ParsedUserAgent {
  for (const [family, pattern] of FAMILY_PATTERNS) {
    const match = pattern.exec(userAgent);
    if (match !== null) {
      const major = Number.parseInt(match[1] ?? "", 10);
      return { family, major: Number.isSafeInteger(major) ? major : undefined, headless: family === "HeadlessChrome" };
    }
  }
  return { family: userAgent.length === 0 ? "unknown" : "other", major: undefined, headless: /headless/i.test(userAgent) };
}

export type ParsedProduct = {
  family: string;
  binaryFamily: string;
  major: number | undefined;
  headless: boolean;
};

// Parses a CDP Browser.getVersion product string such as "HeadlessChrome/145.0.0.0".
export function parseBrowserProduct(product: string): ParsedProduct {
  const parts = product.split("/", 2);
  const family = parts[0] ?? product;
  const version = parts[1];
  const majorText = version?.split(".", 1)[0];
  const major = majorText === undefined ? undefined : Number.parseInt(majorText, 10);
  const headless = /^Headless/i.test(family);
  return {
    family,
    binaryFamily: family.replace(/^Headless/i, ""),
    major: Number.isSafeInteger(major) ? major : undefined,
    headless,
  };
}
