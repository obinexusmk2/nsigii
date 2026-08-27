import { HASH_HEX_LENGTH } from "./header.js";
import { writeUInt64LE, writeString, readUInt64LE, readString } from "../utils/bytes.js";
import type { NSIGIIFooter } from "../types.js";

/** ASCII marker that terminates every conformant NSIGII container. */
export const FOOTER_MAGIC = "ENDNSIGII";
/** Marker emitted by pre-0.1 builds; accepted on read for backward compatibility. */
export const FOOTER_MAGIC_LEGACY = "ENDSIGII";

export const FOOTER_SIZE = FOOTER_MAGIC.length + 8 + HASH_HEX_LENGTH + 64;

export function serializeFooter(f: NSIGIIFooter): Buffer {
  const buf = Buffer.alloc(FOOTER_SIZE);
  let off = 0;
  off = writeString(buf, off, FOOTER_MAGIC, FOOTER_MAGIC.length);
  off = writeUInt64LE(buf, off, f.segmentCount);
  off = writeString(buf, off, f.finalHash, HASH_HEX_LENGTH);
  off = writeString(buf, off, f.signature ?? "", 64);
  return buf;
}

export function deserializeFooter(buf: Buffer): NSIGIIFooter {
  let off = 0;
  const [magic] = readString(buf, off, FOOTER_MAGIC.length);
  if (magic === FOOTER_MAGIC) {
    off += FOOTER_MAGIC.length;
  } else if (readString(buf, 0, FOOTER_MAGIC_LEGACY.length)[0] === FOOTER_MAGIC_LEGACY) {
    off += FOOTER_MAGIC_LEGACY.length;
  } else {
    throw new Error("Invalid NSIGII footer magic");
  }
  const [segmentCount] = readUInt64LE(buf, off); off += 8;
  const [finalHash] = readString(buf, off, HASH_HEX_LENGTH); off += HASH_HEX_LENGTH;
  const [sig] = readString(buf, off, 64); off += 64;
  return { segmentCount, finalHash, signature: sig || undefined };
}
