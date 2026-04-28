export const EXIT_CODES = {
  success: 0,
  materialDifferences: 1,
  usage: 2,
  cdpConnectivity: 3,
  probeFailure: 4,
  schemaValidation: 5,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];
