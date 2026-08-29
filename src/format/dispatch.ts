/**
 * NSIGII format dispatch — the shared 4-way decision.
 *
 * Three unrelated binary layouts share the ASCII prefix `NSIGII` and, by
 * convention, the `.nsigii` extension. This module decides which one (or none)
 * a byte buffer holds, from its first 8 bytes only. It is this repository's
 * implementation of the contract in `docs/DISPATCH.md`; the other repositories
 * implement their own copies from that same text.
 *
 * Detection is not validation: a positive kind means "parse it as this layout
 * next", not "this artifact is well-formed". Each layout has its own integrity
 * gate (CRC-32 for CORE_V1, trident 3/3 consensus for the wrapper, a structural
 * frame walk for the legacy stream).
 */
import { closeSync, openSync, readSync } from "node:fs";
import { resolve } from "node:path";

export const NSIGII_KIND = {
  /** Generic C11 byte container. Owner: obinexus/nsigii_project (FORMAT.md). */
  CORE_V1: "CORE_V1",
  /** Verification envelope. Owner: obinexusmk2/nsigii (this repo). */
  CONSTITUTIONAL_WRAPPER: "CONSTITUTIONAL_WRAPPER",
  /** Legacy media/state stream. Owner: obinexus/nsigii_viewer (FORMAT-LEGACY.md). */
  LEGACY_CODEC_STREAM: "LEGACY_CODEC_STREAM",
  /** Not a NSIGII artifact. Inert — never decode, render, or execute. */
  UNKNOWN: "UNKNOWN",
} as const;

export type NSIGIIKind = (typeof NSIGII_KIND)[keyof typeof NSIGII_KIND];

/** First 8 bytes of a CORE_V1 container. */
export const CORE_V1_MAGIC = Buffer.from("NSIGII01", "ascii");
/** First 8 bytes of a legacy codec stream (`NSIGII` + two NUL padding bytes). */
export const LEGACY_CODEC_MAGIC = Buffer.from("NSIGII\0\0", "latin1");
/** Bytes 0..5 shared by the wrapper and the legacy stream. */
export const NSIGII_PREFIX = Buffer.from("NSIGII", "ascii");
/** Byte 7 of a constitutional wrapper: `version_major`. */
export const WRAPPER_VERSION_MAJOR = 0x07;

/** Bytes needed to classify any artifact. */
export const DISPATCH_PROBE_BYTES = 8;

/**
 * Classify a buffer by its first 8 bytes. Never throws.
 *
 * Order is fixed: CORE_V1 by full 8-byte literal first, then the `NSIGII\0…`
 * prefix arms, then UNKNOWN as the fallthrough. A `NSIGII` prefix with byte 7
 * outside `{0x00, 0x07}` is UNKNOWN, not a guess.
 */
export function detectNsigiiKind(data: Buffer): NSIGIIKind {
  if (data.length < DISPATCH_PROBE_BYTES) return NSIGII_KIND.UNKNOWN;
  if (data.subarray(0, 8).equals(CORE_V1_MAGIC)) return NSIGII_KIND.CORE_V1;
  if (!data.subarray(0, 6).equals(NSIGII_PREFIX)) return NSIGII_KIND.UNKNOWN;
  if (data[6] === 0x00 && data[7] === WRAPPER_VERSION_MAJOR) return NSIGII_KIND.CONSTITUTIONAL_WRAPPER;
  if (data[6] === 0x00 && data[7] === 0x00) return NSIGII_KIND.LEGACY_CODEC_STREAM;
  return NSIGII_KIND.UNKNOWN;
}

/**
 * Classify a file by reading only its first 8 bytes. Never throws for content
 * reasons (a short or empty file is UNKNOWN); it can still throw if the path
 * cannot be opened.
 */
export function detectNsigiiKindFromFile(inputPath: string): NSIGIIKind {
  const fd = openSync(resolve(inputPath), "r");
  try {
    const head = Buffer.alloc(DISPATCH_PROBE_BYTES);
    const read = readSync(fd, head, 0, DISPATCH_PROBE_BYTES, 0);
    return detectNsigiiKind(head.subarray(0, read));
  } finally {
    closeSync(fd);
  }
}

export interface NSIGIIKindInfo {
  kind: NSIGIIKind;
  label: string;
  owner: string;
  /** Safe, non-executing next step for a reader holding this kind. */
  nextAction: string;
}

const KIND_INFO: Record<NSIGIIKind, Omit<NSIGIIKindInfo, "kind">> = {
  CORE_V1: {
    label: "generic C11 byte container (NSIGII01)",
    owner: "obinexus/nsigii_project",
    nextAction: "decode with the C core (native lib, CLI, or WASM); CRC-32 is checked on decode",
  },
  CONSTITUTIONAL_WRAPPER: {
    label: "constitutional verification wrapper (NSIGII\\0 + 0x07)",
    owner: "obinexusmk2/nsigii",
    nextAction: "verify to 3/3 consensus, then extract; extraction is refused below YES",
  },
  LEGACY_CODEC_STREAM: {
    label: "legacy codec stream (NSIGII\\0\\0, 7.0.0 / 7.1.0A)",
    owner: "obinexus/nsigii_viewer",
    nextAction: "hand to the viewer's renderer; frames are DEFLATE media planes, never nested NSIGII",
  },
  UNKNOWN: {
    label: "not a NSIGII artifact",
    owner: "—",
    nextAction: "present metadata; offer save. Never decode, render, or execute.",
  },
};

/** Human-readable description of a kind, for CLI / operator output. */
export function describeNsigiiKind(kind: NSIGIIKind): NSIGIIKindInfo {
  return { kind, ...KIND_INFO[kind] };
}
