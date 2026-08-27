import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type NSIGIIVariant = "wrapper" | "codec";

/**
 * NSIGII has two data-only layouts which share the first six magic bytes.
 * The discriminator is deliberately structural: a v7 wrapper has its major
 * version at byte 7, while a codec stream reserves that byte as zero.
 */
export function detectNsigiiVariant(inputPath: string): NSIGIIVariant {
  const bytes = readFileSync(resolve(inputPath));
  if (bytes.length < 8 || bytes.subarray(0, 6).toString("ascii") !== "NSIGII" || bytes[6] !== 0) {
    throw new Error("Not an NSIGII file: expected the NSIGII magic header");
  }
  if (bytes[7] === 0x07) return "wrapper";
  if (bytes[7] === 0x00) return "codec";
  throw new Error(`Unknown NSIGII layout discriminator at byte 7: 0x${bytes[7].toString(16).padStart(2, "0")}`);
}
