/**
 * CORE_V1 adapter — delegates to the C core in obinexus/nsigii_project.
 *
 * The NSIGII01 wire format is owned by that repository and this package does
 * not re-implement it. Set `NSIGII_C_BIN` to the `nsigii` binary built there
 * (`make`), or pass an explicit path. A WASM path can be added later for
 * environments without a subprocess; the browser adapter lives in the C repo.
 *
 * Encode/decode go through temp files rather than stdin/stdout so the transfer
 * is binary-safe on every platform (the C CLI opens files with "rb"/"wb").
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Thrown when the C core cannot be located or executed at all. */
export class CoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoreUnavailableError";
  }
}

export function resolveCoreBin(explicit?: string): string {
  const bin = explicit ?? process.env.NSIGII_C_BIN;
  if (!bin) {
    throw new CoreUnavailableError(
      "CORE_V1 handling needs the C core. Set NSIGII_C_BIN to the `nsigii` binary from " +
        "obinexus/nsigii_project (build it with `make`), or pass an explicit path.",
    );
  }
  return bin;
}

export interface CoreDecodeResult {
  bytes: Buffer;
  payloadSize: number;
  /** IEEE CRC-32 the C core reported for the decoded payload, if parseable. */
  crc32?: string;
}

function run(bin: string, verb: "pack" | "unpack", input: Buffer): { out: Buffer; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), "nsigii-core-"));
  const inPath = join(dir, "in.bin");
  const outPath = join(dir, "out.bin");
  try {
    writeFileSync(inPath, input);
    const r = spawnSync(bin, [verb, inPath, outPath]);
    if (r.error) {
      throw new CoreUnavailableError(`could not run the C core at "${bin}": ${r.error.message}`);
    }
    if (r.status !== 0) {
      throw new Error(`C core ${verb} failed (exit ${r.status ?? "?"}): ${String(r.stderr).trim() || "no output"}`);
    }
    return { out: readFileSync(outPath), stderr: String(r.stderr) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Decode a CORE_V1 container to its original bytes via the C core. */
export function coreDecode(container: Buffer, opts: { bin?: string } = {}): CoreDecodeResult {
  const { out, stderr } = run(resolveCoreBin(opts.bin), "unpack", container);
  const m = stderr.match(/crc32=([0-9a-fA-F]{8})/);
  return { bytes: out, payloadSize: out.length, crc32: m ? m[1].toLowerCase() : undefined };
}

/** Encode arbitrary bytes into a CORE_V1 container via the C core. */
export function coreEncode(payload: Buffer, opts: { bin?: string } = {}): Buffer {
  return run(resolveCoreBin(opts.bin), "pack", payload).out;
}

/** Whether a C core is configured (does not check that it actually runs). */
export function coreConfigured(explicit?: string): boolean {
  return Boolean(explicit ?? process.env.NSIGII_C_BIN);
}
