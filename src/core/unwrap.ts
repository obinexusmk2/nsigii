/**
 * Bounded, cycle-safe nested dispatch.
 *
 * Repeatedly classifies bytes and descends one layer:
 *   CONSTITUTIONAL_WRAPPER -> verify (must reach 3/3 YES) -> extract payload
 *   CORE_V1                -> C core decode
 *   LEGACY_CODEC_STREAM    -> leaf (never re-dispatched)
 *   UNKNOWN                -> leaf
 *
 * Nothing is ever executed. Descent stops at MAX_UNWRAP_DEPTH, on a wrapper
 * that does not verify, or if a hop reproduces bytes already seen on the chain.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { detectNsigiiKind, NSIGII_KIND, type NSIGIIKind } from "../format/dispatch.js";
import { verifyFile } from "./verify.js";
import { extractPayload } from "./extract.js";
import { coreDecode, CoreUnavailableError } from "../runtime/adapters/core.js";

export const MAX_UNWRAP_DEPTH = 4;

export interface UnwrapHop {
  depth: number;
  kind: NSIGIIKind;
  size: number;
  sha256: string;
  /** What descending from this hop did, or why the chain stopped here. */
  note?: string;
}

export type UnwrapOutcome =
  | "resolved" // reached a LEGACY or UNKNOWN leaf within the depth bound
  | "max-depth" // still nested at MAX_UNWRAP_DEPTH
  | "cycle" // a hop reproduced bytes already seen
  | "verify-failed" // a wrapper did not reach 3/3 consensus
  | "core-unavailable"; // hit a CORE_V1 layer with no C core configured

export interface UnwrapResult {
  chain: UnwrapHop[];
  finalKind: NSIGIIKind;
  outcome: UnwrapOutcome;
  /** Bytes at the terminal hop — the resolved payload, or whatever we stopped on. */
  finalBytes: Buffer;
  /** Set when `output` was requested and written. */
  outputPath?: string;
  message?: string;
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

export interface UnwrapOptions {
  maxDepth?: number;
  /** Write the terminal bytes here. */
  output?: string;
  /** Explicit path to the C core binary (else NSIGII_C_BIN). */
  bin?: string;
}

export function unwrapFile(inputPath: string, opts: UnwrapOptions = {}): UnwrapResult {
  return unwrapBytes(readFileSync(resolve(inputPath)), opts);
}

export function unwrapBytes(input: Buffer, opts: UnwrapOptions = {}): UnwrapResult {
  const maxDepth = opts.maxDepth ?? MAX_UNWRAP_DEPTH;
  const chain: UnwrapHop[] = [];
  const seen = new Set<string>();
  const scratch = mkdtempSync(join(tmpdir(), "nsigii-unwrap-"));

  const done = (finalKind: NSIGIIKind, outcome: UnwrapOutcome, finalBytes: Buffer, message?: string): UnwrapResult => {
    rmSync(scratch, { recursive: true, force: true });
    let outputPath: string | undefined;
    if (opts.output) {
      outputPath = resolve(opts.output);
      writeFileSync(outputPath, finalBytes);
    }
    return { chain, finalKind, outcome, finalBytes, outputPath, message };
  };

  let bytes = input;
  let depth = 0;

  for (;;) {
    const digest = sha256(bytes);
    const kind = detectNsigiiKind(bytes);

    if (seen.has(digest)) {
      chain.push({ depth, kind, size: bytes.length, sha256: digest, note: "bytes already seen on this chain" });
      return done(kind, "cycle", bytes, "identical bytes re-encountered while unwrapping");
    }
    seen.add(digest);
    const hop: UnwrapHop = { depth, kind, size: bytes.length, sha256: digest };
    chain.push(hop);

    if (kind === NSIGII_KIND.LEGACY_CODEC_STREAM || kind === NSIGII_KIND.UNKNOWN) {
      return done(kind, "resolved", bytes);
    }

    if (depth >= maxDepth) {
      hop.note = `still nested; stopped at depth ${maxDepth}`;
      return done(kind, "max-depth", bytes, `reached the ${maxDepth}-hop unwrap limit with a ${kind} still nested`);
    }

    if (kind === NSIGII_KIND.CONSTITUTIONAL_WRAPPER) {
      const hopFile = join(scratch, `hop-${depth}.nsigii`);
      writeFileSync(hopFile, bytes);
      const v = verifyFile(hopFile);
      if (v.consensus !== "YES") {
        hop.note = `verify ${v.consensus} (${v.consensusCount}/3) — descent blocked`;
        return done(kind, "verify-failed", bytes, "wrapper did not reach 3/3 verification consensus");
      }
      hop.note = "verified 3/3 → extracted payload";
      bytes = Buffer.from(extractPayload(hopFile).bytes);
    } else {
      // CORE_V1
      try {
        const dec = coreDecode(bytes, { bin: opts.bin });
        hop.note = dec.crc32 ? `C core decode, CRC-32 ${dec.crc32} ok` : "C core decode";
        bytes = dec.bytes;
      } catch (err) {
        if (err instanceof CoreUnavailableError) {
          hop.note = "CORE_V1 — no C core configured";
          return done(kind, "core-unavailable", bytes, err.message);
        }
        rmSync(scratch, { recursive: true, force: true });
        throw err;
      }
    }
    depth++;
  }
}
