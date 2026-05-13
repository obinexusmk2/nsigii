export function writeUInt8(buf: Buffer, offset: number, val: number): number {
  buf.writeUInt8(val & 0xFF, offset);
  return offset + 1;
}
export function writeUInt32LE(buf: Buffer, offset: number, val: number): number {
  buf.writeUInt32LE(val >>> 0, offset);
  return offset + 4;
}
export function writeUInt64LE(buf: Buffer, offset: number, val: number): number {
  buf.writeBigUInt64LE(BigInt.asUintN(64, BigInt(val)), offset);
  return offset + 8;
}
export function writeFloatLE(buf: Buffer, offset: number, val: number): number {
  buf.writeFloatLE(val, offset);
  return offset + 4;
}
export function writeString(buf: Buffer, offset: number, str: string, maxLen: number): number {
  const b = Buffer.from(str, "utf8");
  const len = Math.min(b.length, maxLen);
  b.copy(buf, offset, 0, len);
  buf.fill(0, offset + len, offset + maxLen);
  return offset + maxLen;
}
export function readUInt8(buf: Buffer, offset: number): [number, number] {
  return [buf.readUInt8(offset), offset + 1];
}
export function readUInt32LE(buf: Buffer, offset: number): [number, number] {
  return [buf.readUInt32LE(offset), offset + 4];
}
export function readUInt64LE(buf: Buffer, offset: number): [number, number] {
  return [Number(buf.readBigUInt64LE(offset)), offset + 8];
}
export function readFloatLE(buf: Buffer, offset: number): [number, number] {
  return [buf.readFloatLE(offset), offset + 4];
}
export function readString(buf: Buffer, offset: number, len: number): [string, number] {
  let end = offset + len;
  for (let i = offset; i < end; i++) if (buf[i] === 0) { end = i; break; }
  return [buf.toString("utf8", offset, end), offset + len];
}
