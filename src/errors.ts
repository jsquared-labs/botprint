import type { ExitCode } from "./exit-codes";

export class BotprintError extends Error {
  readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode) {
    super(message);
    this.name = "BotprintError";
    this.exitCode = exitCode;
  }
}

export function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
