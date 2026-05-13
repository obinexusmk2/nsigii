import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NSIGII_MAGIC } from "../constants.js";
import { HASH_HEX_LENGTH } from "../format/header.js";
import { SEGMENT_ENTRY_SIZE, TRIDENT_SEGMENT_COUNT } from "../format/segment.js";
import type { NSIGIIHeader, NSIGIIChannel, NSIGIISegment, NSIGIIVerification, NSIGIIFooter } from "../types.js";

export interface InspectResult {
  header: NSIGIIHeader;
  channels: NSIGIIChannel[];
  segments: NSIGIISegment[];
  verification: NSIGIIVerification;
  footer: NSIGIIFooter;
  channelTableOffset: number;
  segmentTableOffset: number;
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
  const format = buf.readUInt8(off++);
  off += 1; // reserved
  const headerSize = buf.readUInt32LE(off); off += 4;
  const payloadSize = Number(buf.readBigUInt64LE(off)); off += 8;
  const channelCount = buf.readUInt8(off++);
  const channelTableOffset = Number(buf.readBigUInt64LE(off)); off += 8;
  const segmentTableOffset = Number(buf.readBigUInt64LE(off)); off += 8;
  const payloadOffset = Number(buf.readBigUInt64LE(off)); off += 8;
  validateSize("headerSize", headerSize, buf.length);
  validateOffset("channelTableOffset", channelTableOffset, buf.length);
  validateOffset("segmentTableOffset", segmentTableOffset, buf.length);
  validateOffset("payloadOffset", payloadOffset, buf.length);
  validatePayloadBounds("payload", payloadOffset, payloadSize, buf.length);
  const payloadHash = buf.toString("utf8", off, off + HASH_HEX_LENGTH).replace(/\0/g, ""); off += HASH_HEX_LENGTH;
  const fileId = buf.toString("utf8", off, off + 64).replace(/\0/g, ""); off += 64;
  const createdAt = buf.toString("utf8", off, off + 32).replace(/\0/g, ""); off += 32;
  const originalFilename = buf.toString("utf8", off, off + 128).replace(/\0/g, ""); off += 128;
  const formatHint = buf.toString("utf8", off, off + 32).replace(/\0/g, ""); off += 32;

  const header: NSIGIIHeader = {
    magic: "NSIGII", version, fileId, createdAt,
    originalFilename: originalFilename || undefined,
    formatHint: (formatHint || byteToFormatHint(format)) as any,
    payloadSize, payloadHash,
  };

  off = channelTableOffset;
  const channels: NSIGIIChannel[] = [];
  for (let i = 0; i < channelCount; i++) {
    const id = buf.readUInt8(off++) as 0 | 1 | 2;
    const roleLen = buf.readUInt8(off++);
    const role = buf.toString("utf8", off, off + roleLen); off += roleLen;
    const hash = buf.toString("utf8", off, off + HASH_HEX_LENGTH).replace(/\0/g, ""); off += HASH_HEX_LENGTH;
    const stateByte = buf.readUInt8(off++);
    channels.push({ id, role: role as any, hash, state: byteToClass(stateByte) });
  }

  off = segmentTableOffset;
  const segments: NSIGIISegment[] = [];
  for (let i = 0; i < TRIDENT_SEGMENT_COUNT; i++) {
    const segmentId = Number(buf.readBigUInt64LE(off)); off += 8;
    const channelId = buf.readUInt8(off++) as 0 | 1 | 2;
    const timestampNs = Number(buf.readBigUInt64LE(off)); off += 8;
    const segPayloadOffset = Number(buf.readBigUInt64LE(off)); off += 8;
    const segPayloadSize = Number(buf.readBigUInt64LE(off)); off += 8;
    validateOffset(`segment ${segmentId} payloadOffset`, segPayloadOffset, buf.length);
    validatePayloadBounds(`segment ${segmentId} payload`, segPayloadOffset, segPayloadSize, buf.length);
    const segPayloadHash = buf.toString("utf8", off, off + HASH_HEX_LENGTH).replace(/\0/g, ""); off += HASH_HEX_LENGTH;
    const rwxFlags = buf.readUInt8(off++);
    const stateByte = buf.readUInt8(off++);
    off += 2;
    segments.push({ segmentId, channelId, timestampNs, payloadOffset: segPayloadOffset, payloadSize: segPayloadSize, payloadHash: segPayloadHash, rwxFlags, state: byteToClass(stateByte) });
  }

  off = segmentTableOffset + TRIDENT_SEGMENT_COUNT * SEGMENT_ENTRY_SIZE;
  const vSegmentId = Number(buf.readBigUInt64LE(off)); off += 8;
  const vTransmitHash = buf.toString("utf8", off, off + HASH_HEX_LENGTH).replace(/\0/g, ""); off += HASH_HEX_LENGTH;
  const vReceiveHash = buf.toString("utf8", off, off + HASH_HEX_LENGTH).replace(/\0/g, ""); off += HASH_HEX_LENGTH;
  const vVerifyHash = buf.toString("utf8", off, off + HASH_HEX_LENGTH).replace(/\0/g, ""); off += HASH_HEX_LENGTH;
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
  const finalHash = buf.toString("utf8", off, off + HASH_HEX_LENGTH).replace(/\0/g, ""); off += HASH_HEX_LENGTH;
  const signature = buf.toString("utf8", off, off + 64).replace(/\0/g, "") || undefined;
  const footer: NSIGIIFooter = { segmentCount: fSegmentCount, finalHash, signature };

  return { header, channels, segments, verification, footer, channelTableOffset, segmentTableOffset, payloadOffset, payloadSize };
}

function validateOffset(name: string, offset: number, length: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= length) {
    throw new Error(`Invalid NSIGII offset ${name}: ${offset} outside file bounds 0-${length - 1}`);
  }
}

function validateSize(name: string, size: number, length: number): void {
  if (!Number.isSafeInteger(size) || size < 0 || size > length) {
    throw new Error(`Invalid NSIGII ${name}: ${size} outside file length ${length}`);
  }
}

function validatePayloadBounds(name: string, offset: number, size: number, length: number): void {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error(`Invalid NSIGII ${name} size: ${size}`);
  }
  const end = offset + size;
  if (!Number.isSafeInteger(end) || end > length) {
    throw new Error(`Invalid NSIGII ${name} bounds: ${offset} + ${size} exceeds file length ${length}`);
  }
}

function byteToFormatHint(b: number) {
  switch (b) { case 1: return "archive"; case 2: return "video"; case 3: return "audio"; case 4: return "text"; case 5: return "wasm"; case 6: return "binary"; case 7: return "mixed"; default: return "unknown"; }
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
