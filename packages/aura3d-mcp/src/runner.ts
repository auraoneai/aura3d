// Runs the Aura3D CLI / create-aura3d for the project and turns the result into structured data.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface RunResult {
  readonly ok: boolean;
  readonly exitCode: number | null;
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly json?: unknown;
  readonly timedOut?: boolean;
  readonly error?: string;
}

/** node_modules/.bin/<bin> searched upward from the project directory. */
export function findBin(projectDir: string, bin: string): string | undefined {
  let dir = resolve(projectDir);
  for (;;) {
    const candidate = join(dir, "node_modules", ".bin", bin);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export interface RunOptions {
  readonly cwd: string;
  readonly timeoutMs?: number;
  readonly maxBuffer?: number;
}

export function run(file: string, args: readonly string[], options: RunOptions): Promise<RunResult> {
  const command = [file.split("/").at(-1) ?? file, ...args].join(" ");
  return new Promise((resolvePromise) => {
    execFile(file, [...args], { cwd: options.cwd, timeout: options.timeoutMs ?? 120_000, maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024, env: { ...process.env, CI: "1", NO_COLOR: "1" } }, (error, stdout, stderr) => {
      const timedOut = Boolean(error && (error as NodeJS.ErrnoException & { killed?: boolean }).killed);
      const exitCode = error ? (typeof (error as { code?: unknown }).code === "number" ? ((error as { code: number }).code) : null) : 0;
      let json: unknown;
      const trimmed = stdout.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          json = JSON.parse(trimmed);
        } catch {
          json = undefined;
        }
      }
      resolvePromise({ ok: !error, exitCode, command, stdout, stderr, json, timedOut: timedOut || undefined, error: error && exitCode === null ? error.message : undefined });
    });
  });
}

export async function runCli(projectDir: string, args: readonly string[], timeoutMs?: number): Promise<RunResult> {
  const bin = findBin(projectDir, "aura3d");
  if (!bin) {
    return { ok: false, exitCode: null, command: `aura3d ${args.join(" ")}`, stdout: "", stderr: "", error: `The @aura3d/cli binary is not installed for ${projectDir}. Run: npm install --save-dev @aura3d/cli (or use npx @aura3d/cli@latest ...).` };
  }
  return run(bin, args, { cwd: projectDir, timeoutMs });
}
