import { writeUInt8, writeUInt64LE, writeString, readUInt8, readUInt64LE, readString } from "../utils/bytes.js";
import type { NSIGIISegment, NSIGIIClassification } from "../types.js";

export function serializeSegments(segments: NSIGIISegment[]): Buffer {
  const buf = Buffer.alloc(segments.length * 71);
  let off = 0;
  for (const s of segments) {
    off = writeUInt64LE(buf, off, s.segmentId);
    off = writeUInt8(buf, off, s.channelId);
    off = writeUInt64LE(buf, off, s.timestampNs);
    off = writeUInt64LE(buf, off, s.payloadOffset);
    off = writeUInt64LE(buf, off, s.payloadSize);
    off = writeString(buf, off, s.payloadHash, 32);
    off = writeUInt8(buf, off, s.rwxFlags);
    off = writeUInt8(buf, off, classificationToByte(s.state));
    off += 2;
  }
  return buf;
}

export function deserializeSegments(buf: Buffer, count: number): NSIGIISegment[] {
  const segments: NSIGIISegment[] = [];
  let off = 0;
  for (let i = 0; i < count; i++) {
    const [segmentId] = readUInt64LE(buf, off); off += 8;
    const [channelId] = readUInt8(buf, off); off += 1;
    const [timestampNs] = readUInt64LE(buf, off); off += 8;
    const [payloadOffset] = readUInt64LE(buf, off); off += 8;
    const [payloadSize] = readUInt64LE(buf, off); off += 8;
    const [payloadHash] = readString(buf, off, 32); off += 32;
    const [rwxFlags] = readUInt8(buf, off); off += 1;
    const [stateByte] = readUInt8(buf, off); off += 1;
    off += 2;
    segments.push({ segmentId, channelId: channelId as 0|1|2, timestampNs, payloadOffset, payloadSize, payloadHash, rwxFlags, state: byteToClass(stateByte) });
  }
  return segments;
}

export function buildTridentSegments(payloadOffset: number, payloadSize: number, payloadHash: string): NSIGIISegment[] {
  const now = Number(process.hrtime.bigint());
  return [
    { segmentId: 0, channelId: 0, timestampNs: now, payloadOffset, payloadSize, payloadHash, rwxFlags: 0b010, state: "SIGNAL" },
    { segmentId: 1, channelId: 1, timestampNs: now + 1, payloadOffset, payloadSize, payloadHash, rwxFlags: 0b100, state: "SIGNAL" },
    { segmentId: 2, channelId: 2, timestampNs: now + 2, payloadOffset, payloadSize, payloadHash, rwxFlags: 0b001, state: "SIGNAL" },
  ];
}

function classificationToByte(c: NSIGIIClassification): number {
  switch (c) { case "NOISE": return 0x00; case "NONOISE": return 0x01; case "SIGNAL": return 0x02; case "NOSIGNAL": return 0x03; }
}
function byteToClass(b: number): NSIGIIClassification {
  switch (b) { case 0x00: return "NOISE"; case 0x01: return "NONOISE"; case 0x02: return "SIGNAL"; case 0x03: return "NOSIGNAL"; default: return "NOISE"; }
}
