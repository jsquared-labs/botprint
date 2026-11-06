// Cross-compiles standalone binaries for every supported platform into dist/release/.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const TARGETS = ["bun-linux-x64", "bun-linux-arm64", "bun-darwin-arm64", "bun-darwin-x64", "bun-windows-x64"] as const;

const outDir = join(import.meta.dir, "..", "dist", "release");
await mkdir(outDir, { recursive: true });

for (const target of TARGETS) {
  const suffix = target.replace(/^bun-/, "");
  // Unversioned names so the README's `releases/latest/download/botprint-<target>` URL stays stable; the tag carries the version.
  const outfile = join(outDir, `botprint-${suffix}${target.includes("windows") ? ".exe" : ""}`);
  const proc = Bun.spawn(["bun", "build", "--compile", `--target=${target}`, "src/cli.ts", "--outfile", outfile], {
    cwd: join(import.meta.dir, ".."),
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error(`Build failed for ${target}`);
    process.exit(exitCode);
  }
}

console.log(`Wrote release binaries to ${outDir}`);
