import { writeUInt8, writeUInt32LE, writeUInt64LE, writeString, readUInt8, readUInt32LE, readUInt64LE, readString } from "../utils/bytes.js";
import type { NSIGIIHeader, NSIGIIFormatHint } from "../types.js";

export const HASH_HEX_LENGTH = 64;

export interface SerializedHeader {
  buffer: Buffer;
  headerSize: number;
  channelTableOffsetPos: number;
  segmentTableOffsetPos: number;
  payloadOffsetPos: number;
}

export function serializeHeader(h: NSIGIIHeader): SerializedHeader {
  const buf = Buffer.alloc(512);
  let off = 0;
  off = writeString(buf, off, h.magic, 7);
  const [maj, min, pat] = h.version.split(".").map(Number);
  off = writeUInt8(buf, off, maj);
  off = writeUInt8(buf, off, min);
  off = writeUInt8(buf, off, pat);
  off = writeUInt8(buf, off, formatHintToByte(h.formatHint ?? "unknown"));
  off = writeUInt8(buf, off, 0);
  const headerSizeOffset = off;
  off = writeUInt32LE(buf, off, 0);
  off = writeUInt64LE(buf, off, h.payloadSize);
  off = writeUInt8(buf, off, 3);
  const channelTableOffsetPos = off;
  off = writeUInt64LE(buf, off, 0);
  const segmentTableOffsetPos = off;
  off = writeUInt64LE(buf, off, 0);
  const payloadOffsetPos = off;
  off = writeUInt64LE(buf, off, 0);
  off = writeString(buf, off, h.payloadHash, HASH_HEX_LENGTH);
  off = writeString(buf, off, h.fileId, 64);
  off = writeString(buf, off, h.createdAt, 32);
  off = writeString(buf, off, h.originalFilename ?? "", 128);
  off = writeString(buf, off, h.formatHint ?? "", 32);
  const headerSize = off;
  writeUInt32LE(buf, headerSizeOffset, headerSize);
  return { buffer: buf.subarray(0, off), headerSize, channelTableOffsetPos, segmentTableOffsetPos, payloadOffsetPos };
}

export function deserializeHeader(buf: Buffer): NSIGIIHeader {
  let off = 0;
  const [magic] = readString(buf, off, 7); off += 7;
  if (magic !== "NSIGII") throw new Error("Invalid NSIGII magic header");
  const [maj] = readUInt8(buf, off); off += 1;
  const [min] = readUInt8(buf, off); off += 1;
  const [pat] = readUInt8(buf, off); off += 1;
  const [fmt] = readUInt8(buf, off); off += 1;
  off += 1;
  const [, nextOff] = readUInt32LE(buf, off); off = nextOff;
  const [payloadSize] = readUInt64LE(buf, off); off += 8;
  off += 1; // channel count
  off += 8; // channel table offset
  off += 8; // segment table offset
  off += 8; // payload offset
  const [payloadHash] = readString(buf, off, HASH_HEX_LENGTH); off += HASH_HEX_LENGTH;
  const [fileId] = readString(buf, off, 64); off += 64;
  const [createdAt] = readString(buf, off, 32); off += 32;
  const [orig] = readString(buf, off, 128); off += 128;
  // const [fmtHint] = readString(buf, off, 32); off += 32;
  return {
    magic: "NSIGII", version: `${maj}.${min}.${pat}` as "7.0.0",
    fileId, createdAt,
    originalFilename: orig || undefined,
    formatHint: byteToFormatHint(fmt),
    payloadSize, payloadHash,
  };
}

function formatHintToByte(h: NSIGIIFormatHint): number {
  const m: Record<string, number> = { archive:1, video:2, audio:3, text:4, wasm:5, binary:6, mixed:7, unknown:0 };
  return m[h] ?? 0;
}
function byteToFormatHint(b: number): NSIGIIFormatHint {
  const m: Record<number, NSIGIIFormatHint> = { 1:"archive", 2:"video", 3:"audio", 4:"text", 5:"wasm", 6:"binary", 7:"mixed" };
  return m[b] ?? "unknown";
}
