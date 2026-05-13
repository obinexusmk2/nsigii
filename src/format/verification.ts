import { writeUInt8, writeUInt64LE, writeFloatLE, writeString, readUInt8, readUInt64LE, readFloatLE, readString } from "../utils/bytes.js";
import type { NSIGIIVerification, NSIGIIConsensusState, NSIGIIHumanRightsTag } from "../types.js";

export function serializeVerification(v: NSIGIIVerification): Buffer {
  const buf = Buffer.alloc(8 + 32 + 32 + 32 + 1 + 4 + 1 + 7);
  let off = 0;
  off = writeUInt64LE(buf, off, v.segmentId);
  off = writeString(buf, off, v.transmitHash, 32);
  off = writeString(buf, off, v.receiveHash, 32);
  off = writeString(buf, off, v.verifyHash, 32);
  off = writeUInt8(buf, off, consensusToByte(v.consensus));
  off = writeFloatLE(buf, off, v.consensusScore);
  off = writeUInt8(buf, off, hrTagToByte(v.humanRightsTag));
  off += 7;
  return buf;
}

export function deserializeVerification(buf: Buffer): NSIGIIVerification {
  let off = 0;
  const [segmentId] = readUInt64LE(buf, off); off += 8;
  const [transmitHash] = readString(buf, off, 32); off += 32;
  const [receiveHash] = readString(buf, off, 32); off += 32;
  const [verifyHash] = readString(buf, off, 32); off += 32;
  const [consensusByte] = readUInt8(buf, off); off += 1;
  const [consensusScore] = readFloatLE(buf, off); off += 4;
  const [hrByte] = readUInt8(buf, off); off += 1;
  off += 7;
  return { segmentId, transmitHash, receiveHash, verifyHash, consensus: byteToConsensus(consensusByte), consensusScore, humanRightsTag: byteToHrTag(hrByte) };
}

export function buildVerification(payloadHash: string): NSIGIIVerification {
  return { segmentId: 2, transmitHash: payloadHash, receiveHash: payloadHash, verifyHash: payloadHash, consensus: "YES", consensusScore: 1.0, humanRightsTag: "VERIFY" };
}

function consensusToByte(c: NSIGIIConsensusState): number {
  switch (c) { case "YES": return 0xFF; case "NO": return 0x00; case "MAYBE": return 0x10; }
}
function byteToConsensus(b: number): NSIGIIConsensusState {
  switch (b) { case 0xFF: return "YES"; case 0x00: return "NO"; case 0x10: return "MAYBE"; default: return "MAYBE"; }
}
function hrTagToByte(t: NSIGIIHumanRightsTag): number {
  switch (t) { case "NONE": return 0x00; case "TRANSMIT": return 0x01; case "RECEIVE": return 0x02; case "VERIFY": return 0x03; case "ARCHIVE": return 0x04; case "EVIDENCE": return 0x05; }
}
function byteToHrTag(b: number): NSIGIIHumanRightsTag {
  switch (b) { case 0x00: return "NONE"; case 0x01: return "TRANSMIT"; case 0x02: return "RECEIVE"; case 0x03: return "VERIFY"; case 0x04: return "ARCHIVE"; case 0x05: return "EVIDENCE"; default: return "NONE"; }
}
