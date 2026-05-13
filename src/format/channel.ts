import { HASH_HEX_LENGTH } from "./header.js";
import { writeUInt8, writeString, readUInt8, readString } from "../utils/bytes.js";
import type { NSIGIIChannel, NSIGIIClassification, NSIGIIChannelRole } from "../types.js";

export function serializeChannels(channels: NSIGIIChannel[]): Buffer {
  let size = 0;
  for (const ch of channels) size += 1 + 1 + ch.role.length + HASH_HEX_LENGTH + 1;
  const buf = Buffer.alloc(size);
  let off = 0;
  for (const ch of channels) {
    off = writeUInt8(buf, off, ch.id);
    off = writeUInt8(buf, off, ch.role.length);
    off = writeString(buf, off, ch.role, ch.role.length);
    off = writeString(buf, off, ch.hash, HASH_HEX_LENGTH);
    off = writeUInt8(buf, off, classificationToByte(ch.state));
  }
  return buf;
}

export function deserializeChannels(buf: Buffer, count: number): NSIGIIChannel[] {
  const channels: NSIGIIChannel[] = [];
  let off = 0;
  for (let i = 0; i < count; i++) {
    const [id] = readUInt8(buf, off); off += 1;
    const [roleLen] = readUInt8(buf, off); off += 1;
    const [role] = readString(buf, off, roleLen); off += roleLen;
    const [hash] = readString(buf, off, HASH_HEX_LENGTH); off += HASH_HEX_LENGTH;
    const [stateByte] = readUInt8(buf, off); off += 1;
    channels.push({ id: id as 0|1|2, role: role as NSIGIIChannelRole, hash, state: byteToClass(stateByte) });
  }
  return channels;
}

export function buildTridentChannels(payloadHash: string): NSIGIIChannel[] {
  return [
    { id: 0, role: "TRANSMIT", hash: payloadHash, state: "SIGNAL" },
    { id: 1, role: "RECEIVE",  hash: payloadHash, state: "SIGNAL" },
    { id: 2, role: "VERIFY",   hash: payloadHash, state: "SIGNAL" },
  ];
}

function classificationToByte(c: NSIGIIClassification): number {
  switch (c) { case "NOISE": return 0x00; case "NONOISE": return 0x01; case "SIGNAL": return 0x02; case "NOSIGNAL": return 0x03; }
}
function byteToClass(b: number): NSIGIIClassification {
  switch (b) { case 0x00: return "NOISE"; case 0x01: return "NONOISE"; case 0x02: return "SIGNAL"; case 0x03: return "NOSIGNAL"; default: return "NOISE"; }
}
