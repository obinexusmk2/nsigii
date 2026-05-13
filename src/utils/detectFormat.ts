import { NSIGIIFormatHint } from "../types.js";

const MAGIC_MAP: { magic: Buffer; hint: NSIGIIFormatHint }[] = [
  { magic: Buffer.from([0x50,0x4B,0x03,0x04]), hint: "archive" },
  { magic: Buffer.from([0x1F,0x8B]), hint: "archive" },
  { magic: Buffer.from([0x52,0x61,0x72,0x21]), hint: "archive" },
  { magic: Buffer.from([0x25,0x50,0x44,0x46]), hint: "text" },
  { magic: Buffer.from([0x00,0x00,0x00,0x20,0x66,0x74,0x79,0x70]), hint: "video" },
  { magic: Buffer.from([0x1A,0x45,0xDF,0xA3]), hint: "video" },
  { magic: Buffer.from([0xFF,0xFB]), hint: "audio" },
  { magic: Buffer.from([0x49,0x44,0x33]), hint: "audio" },
  { magic: Buffer.from([0x00,0x61,0x73,0x6D]), hint: "wasm" },
  { magic: Buffer.from([0x4D,0x5A]), hint: "binary" },
  { magic: Buffer.from([0x7F,0x45,0x4C,0x46]), hint: "binary" },
];

export function detectFormatHint(data: Buffer): NSIGIIFormatHint {
  for (const { magic, hint } of MAGIC_MAP) {
    if (data.length >= magic.length && data.subarray(0, magic.length).equals(magic)) return hint;
  }
  let printable = 0;
  const sample = Math.min(data.length, 512);
  for (let i = 0; i < sample; i++) {
    const b = data[i];
    if ((b >= 0x20 && b <= 0x7E) || b === 0x0A || b === 0x0D || b === 0x09) printable++;
  }
  return sample > 0 && printable / sample > 0.85 ? "text" : "unknown";
}
