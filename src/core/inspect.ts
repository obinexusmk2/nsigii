import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NSIGII_MAGIC } from "../constants.js";
import type { NSIGIIHeader, NSIGIIChannel, NSIGIISegment, NSIGIIVerification, NSIGIIFooter } from "../types.js";

export interface InspectResult {
  header: NSIGIIHeader;
  channels: NSIGIIChannel[];
  segments: NSIGIISegment[];
  verification: NSIGIIVerification;
  footer: NSIGIIFooter;
  payloadOffset: number;
  payloadSize: number;
}

export function inspectFile(inputPath: string): InspectResult {
  const buf = readFileSync(resolve(inputPath));
  if (!buf.subarray(0, 6).equals(NSIGII_MAGIC.subarray(0, 6))) throw new Error("Not a valid NSIGII file");

  const footerMagic = Buffer.from("ENDSIGII", "ascii");
  const footerPos = buf.lastIndexOf(footerMagic);
  if (footerPos === -1) throw new Error("NSIGII footer not found");

  let off = 7;
  const major = buf.readUInt8(off++);
  const minor = buf.readUInt8(off++);
  const patch = buf.readUInt8(off++);
  const version = `${major}.${minor}.${patch}` as "7.0.0";
  off++;
 off += 4;
  const payloadSize = Number(buf.readBigUInt64LE(off)); off += 8;
  const channelCount = buf.readUInt8(off++);
  const channelTableOffset = Number(buf.readBigUInt64LE(off)); off += 8;
  const segmentTableOffset = Number(buf.readBigUInt64LE(off)); off += 8;
  const payloadOffset = Number(buf.readBigUInt64LE(off)); off += 8;
  const payloadHash = buf.toString("utf8", off, off + 32).replace(/\0/g, ""); off += 32;
  const fileId = buf.toString("utf8", off, off + 64).replace(/\0/g, ""); off += 64;
  const createdAt = buf.toString("utf8", off, off + 32).replace(/\0/g, ""); off += 32;
  const originalFilename = buf.toString("utf8", off, off + 128).replace(/\0/g, ""); off += 128;
  const formatHint = buf.toString("utf8", off, off + 32).replace(/\0/g, ""); off += 32;

  const header: NSIGIIHeader = {
    magic: "NSIGII", version, fileId, createdAt,
    originalFilename: originalFilename || undefined,
    formatHint: (formatHint || undefined) as any,
    payloadSize, payloadHash,
  };

  off = channelTableOffset;
  const channels: NSIGIIChannel[] = [];
  for (let i = 0; i < channelCount; i++) {
    const id = buf.readUInt8(off++) as 0 | 1 | 2;
    const roleLen = buf.readUInt8(off++);
    const role = buf.toString("utf8", off, off + roleLen); off += roleLen;
    const hash = buf.toString("utf8", off, off + 32).replace(/\0/g, ""); off += 32;
    const stateByte = buf.readUInt8(off++);
    channels.push({ id, role: role as any, hash, state: byteToClass(stateByte) });
  }

  off = segmentTableOffset;
  const segments: NSIGIISegment[] = [];
  for (let i = 0; i < 3; i++) {
    const segmentId = Number(buf.readBigUInt64LE(off)); off += 8;
    const channelId = buf.readUInt8(off++) as 0 | 1 | 2;
    const timestampNs = Number(buf.readBigUInt64LE(off)); off += 8;
    const segPayloadOffset = Number(buf.readBigUInt64LE(off)); off += 8;
    const segPayloadSize = Number(buf.readBigUInt64LE(off)); off += 8;
    const segPayloadHash = buf.toString("utf8", off, off + 32).replace(/\0/g, ""); off += 32;
    const rwxFlags = buf.readUInt8(off++);
    const stateByte = buf.readUInt8(off++);
    off += 2;
    segments.push({ segmentId, channelId, timestampNs, payloadOffset: segPayloadOffset, payloadSize: segPayloadSize, payloadHash: segPayloadHash, rwxFlags, state: byteToClass(stateByte) });
  }

  off = segmentTableOffset + 3 * 71;
  const vSegmentId = Number(buf.readBigUInt64LE(off)); off += 8;
  const vTransmitHash = buf.toString("utf8", off, off + 32).replace(/\0/g, ""); off += 32;
  const vReceiveHash = buf.toString("utf8", off, off + 32).replace(/\0/g, ""); off += 32;
  const vVerifyHash = buf.toString("utf8", off, off + 32).replace(/\0/g, ""); off += 32;
  const consensusByte = buf.readUInt8(off++);
  const consensusScore = buf.readFloatLE(off); off += 4;
  const hrByte = buf.readUInt8(off++); off += 7;
  const verification: NSIGIIVerification = {
    segmentId: vSegmentId, transmitHash: vTransmitHash, receiveHash: vReceiveHash, verifyHash: vVerifyHash,
    consensus: byteToConsensus(consensusByte), consensusScore, humanRightsTag: byteToHrTag(hrByte),
  };

  off = footerPos;
 off += 8;
  const fSegmentCount = Number(buf.readBigUInt64LE(off)); off += 8;
  const finalHash = buf.toString("utf8", off, off + 32).replace(/\0/g, ""); off += 32;
  const signature = buf.toString("utf8", off, off + 64).replace(/\0/g, "") || undefined;
  const footer: NSIGIIFooter = { segmentCount: fSegmentCount, finalHash, signature };

  return { header, channels, segments, verification, footer, payloadOffset, payloadSize };
}

function byteToClass(b: number) {
  switch (b) { case 0x00: return "NOISE"; case 0x01: return "NONOISE"; case 0x02: return "SIGNAL"; case 0x03: return "NOSIGNAL"; default: return "NOISE"; }
}
function byteToConsensus(b: number) {
  switch (b) { case 0xFF: return "YES"; case 0x00: return "NO"; case 0x10: return "MAYBE"; default: return "MAYBE"; }
}
function byteToHrTag(b: number) {
  switch (b) { case 0x00: return "NONE"; case 0x01: return "TRANSMIT"; case 0x02: return "RECEIVE"; case 0x03: return "VERIFY"; case 0x04: return "ARCHIVE"; case 0x05: return "EVIDENCE"; default: return "NONE"; }
}
