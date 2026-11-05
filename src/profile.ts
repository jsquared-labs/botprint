import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { BotprintError } from "./errors";
import { EXIT_CODES } from "./exit-codes";

export const SCHEMA_VERSION = "0.3";

const AvailabilitySchema = z.enum(["available", "unavailable", "error"]);
const TimedAvailabilitySchema = z.enum(["available", "unavailable", "error", "timeout"]);
const PermissionStateSchema = z.enum(["granted", "denied", "prompt", "unsupported", "error", "unknown"]);

export const PROBE_WARNINGS = ["page-contamination-possible", "default-browser-context", "multiple-browser-contexts", "http-not-captured"] as const;

const FindingSchema = z.object({
  id: z.string(),
  severity: z.enum(["normal", "notable", "warning", "compatibility_risk", "high_confidence_automation_signal"]),
  category: z.string(),
  title: z.string(),
  evidence: z.array(z.string()),
  explanation: z.string(),
  likely_implications: z.string(),
  suggested_investigation: z.string(),
});

const ProfileSchema = z
  .object({
    schema_version: z.literal(SCHEMA_VERSION),
    botprint_version: z.string(),
    created_at: z.iso.datetime(),
    source: z.object({
      label: z.string().optional(),
      cdp_endpoint_kind: z.enum(["http", "https", "ws", "wss"]),
      browser_version: z.string(),
      target_url: z.string(),
      probe_context: z.enum(["local-diagnostic-page", "existing-target"]),
      browser_context_id: z.string().optional(),
      browser_context_source: z.enum(["page-target", "browser-default", "explicit"]).optional(),
      target_id: z.string().optional(),
      target_type: z.string().optional(),
      probe_timeout_ms: z.number().int().positive().optional(),
      probe_warnings: z.array(z.enum(PROBE_WARNINGS)).optional(),
    }),
    signals: z.object({
      identity: z.object({
        user_agent: z.string(),
        user_agent_data: z
          .object({
            brands: z.array(z.object({ brand: z.string(), version: z.string() })),
            mobile: z.boolean(),
            platform: z.string(),
          })
          .optional(),
        platform: z.string(),
        language: z.string(),
        languages: z.array(z.string()),
        plugins_count: z.number().int().nonnegative(),
        mime_types_count: z.number().int().nonnegative(),
        pdf_viewer_enabled: z.boolean().nullable(),
      }),
      automation: z.object({
        webdriver: z.boolean().nullable(),
        chrome_object: z.boolean(),
        globals: z.record(z.string(), z.boolean()),
      }),
      environment: z.object({
        timezone: z.string(),
        viewport: z.object({
          width: z.number().nonnegative(),
          height: z.number().nonnegative(),
          device_scale_factor: z.number().nonnegative(),
        }),
        outer_window: z.object({
          width: z.number().nonnegative(),
          height: z.number().nonnegative(),
        }),
        screen: z.object({
          width: z.number().nonnegative(),
          height: z.number().nonnegative(),
          avail_width: z.number().nonnegative(),
          avail_height: z.number().nonnegative(),
          color_depth: z.number().nonnegative(),
        }),
        hardware_concurrency: z.number().nonnegative(),
        device_memory: z.number().nonnegative().nullable(),
        speech_voices_count: z.number().int().nonnegative(),
      }),
      rendering: z.object({
        webgl: z.object({
          status: AvailabilitySchema,
          vendor: z.string().optional(),
          renderer: z.string().optional(),
          unmasked_vendor: z.string().optional(),
          unmasked_renderer: z.string().optional(),
        }),
        canvas: z.object({
          status: z.enum(["stable", "unstable", "unavailable", "error"]),
          hash: z.string().optional(),
        }),
        audio: z.object({
          status: TimedAvailabilitySchema,
          hash: z.string().optional(),
        }),
        fonts: z.object({
          status: AvailabilitySchema,
          checked: z.number().int().nonnegative(),
          detected: z.array(z.string()),
        }),
      }),
      storage: z.object({
        cookies_enabled: z.boolean(),
        local_storage: AvailabilitySchema,
        session_storage: AvailabilitySchema,
        indexed_db: TimedAvailabilitySchema,
        service_worker: AvailabilitySchema,
      }),
      permissions: z.record(z.string(), PermissionStateSchema),
      webrtc: z.object({
        api_available: z.boolean(),
        host_candidate_gathering: z.enum(["present", "absent", "unsupported", "error", "timeout"]),
        candidate_count: z.number().int().nonnegative(),
      }),
      http: z
        .object({
          status: z.enum(["captured", "not-captured"]),
          request_headers: z.record(z.string(), z.string()),
        })
        .optional(),
      cdp: z.object({
        product: z.string(),
        protocol_version: z.string(),
        user_agent: z.string(),
      }),
    }),
    findings: z.array(FindingSchema),
  })
  .passthrough();

export type BotprintProfile = z.infer<typeof ProfileSchema>;
export type ProbeWarning = (typeof PROBE_WARNINGS)[number];

export async function readProfile(path: string): Promise<BotprintProfile> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BotprintError(`Could not read profile ${path}: ${message}`, EXIT_CODES.usage);
  }

  try {
    return validateProfile(JSON.parse(raw));
  } catch (error) {
    if (error instanceof BotprintError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new BotprintError(`Profile is not valid JSON: ${message}`, EXIT_CODES.schemaValidation);
  }
}

export async function writeProfile(path: string, profile: BotprintProfile): Promise<void> {
  const validated = validateProfile(profile);
  await writeFile(path, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
}

export function validateProfile(profile: unknown): BotprintProfile {
  const result = ProfileSchema.safeParse(profile);
  if (!result.success) {
    const version = typeof profile === "object" && profile !== null ? (profile as { schema_version?: unknown }).schema_version : undefined;
    const hint =
      typeof version === "string" && version !== SCHEMA_VERSION
        ? ` Profile schema_version is ${version}; this Botprint reads ${SCHEMA_VERSION}. Regenerate the profile with \`botprint run\`.`
        : "";
    throw new BotprintError(`Profile validation failed: ${z.prettifyError(result.error)}${hint}`, EXIT_CODES.schemaValidation);
  }

  return result.data;
}

export function endpointKind(endpoint: string): BotprintProfile["source"]["cdp_endpoint_kind"] {
  const url = new URL(endpoint);
  if (url.protocol === "http:") return "http";
  if (url.protocol === "https:") return "https";
  if (url.protocol === "ws:") return "ws";
  if (url.protocol === "wss:") return "wss";
  throw new BotprintError(`Unsupported CDP endpoint protocol: ${url.protocol}`, EXIT_CODES.usage);
}
