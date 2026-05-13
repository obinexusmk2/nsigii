import { HASH_HEX_LENGTH } from "./header.js";
import { writeUInt64LE, writeString, readUInt64LE, readString } from "../utils/bytes.js";
import type { NSIGIIFooter } from "../types.js";

export const FOOTER_SIZE = 8 + 8 + HASH_HEX_LENGTH + 64;

export function serializeFooter(f: NSIGIIFooter): Buffer {
  const buf = Buffer.alloc(FOOTER_SIZE);
  let off = 0;
  off = writeString(buf, off, "ENDSIGII", 8);
  off = writeUInt64LE(buf, off, f.segmentCount);
  off = writeString(buf, off, f.finalHash, HASH_HEX_LENGTH);
  off = writeString(buf, off, f.signature ?? "", 64);
  return buf;
}

export function deserializeFooter(buf: Buffer): NSIGIIFooter {
  let off = 0;
  const [magic] = readString(buf, off, 8); off += 8;
  if (magic !== "ENDSIGII") throw new Error("Invalid NSIGII footer magic");
  const [segmentCount] = readUInt64LE(buf, off); off += 8;
  const [finalHash] = readString(buf, off, HASH_HEX_LENGTH); off += HASH_HEX_LENGTH;
  const [sig] = readString(buf, off, 64); off += 64;
  return { segmentCount, finalHash, signature: sig || undefined };
}
