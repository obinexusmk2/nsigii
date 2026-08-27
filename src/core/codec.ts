import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { resolve } from "node:path";
import { detectNsigiiVariant } from "./variant.js";

const HEADER_SIZE = 32;
const MAX_DIMENSION = 65535;

export interface NSIGIICodecInfo {
  variant: "codec";
  version: string;
  width: number;
  height: number;
  declaredFrameCount: number;
  frameCount: number;
  reserved: number;
  kind: "video" | "ascii";
  complete: boolean;
  compressedBytes: number;
}

export interface NSIGIICodecVerifyResult {
  variant: "codec";
  readable: boolean;
  frameCountMatch: boolean;
  inflatedFrames: number;
  error?: string;
}

function parseCodec(inputPath: string, inflate: boolean): NSIGIICodecInfo & { inflatedFrames: number } {
  if (detectNsigiiVariant(inputPath) !== "codec") {
    throw new Error("This command expects an NSIGII codec stream, not a constitutional wrapper");
  }
  const bytes = readFileSync(resolve(inputPath));
  if (bytes.length < HEADER_SIZE) throw new Error("Codec stream is shorter than its 32-byte header");
  const version = bytes.toString("ascii", 8, 16).replace(/\0/g, "");
  const width = bytes.readUInt32LE(16);
  const height = bytes.readUInt32LE(20);
  const declaredFrameCount = bytes.readUInt32LE(24);
  const reserved = bytes.readUInt32LE(28);
  if (!version) throw new Error("Codec stream has no version");
  if (width === 0 || height === 0 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error(`Codec stream has unusable dimensions ${width}x${height}`);
  }

  let offset = HEADER_SIZE;
  let frameCount = 0;
  let compressedBytes = 0;
  let complete = true;
  while (offset + 4 <= bytes.length) {
    const size = bytes.readUInt32LE(offset); offset += 4;
    if (size === 0) { frameCount++; continue; }
    if (offset + size > bytes.length) { complete = false; break; }
    const frame = bytes.subarray(offset, offset + size);
    if (inflate) inflateRawSync(frame);
    offset += size;
    compressedBytes += size + 4;
    frameCount++;
  }
  if (offset !== bytes.length) complete = false;
  return {
    variant: "codec", version, width, height, declaredFrameCount, frameCount,
    reserved, kind: version.endsWith("A") ? "ascii" : "video", complete,
    compressedBytes, inflatedFrames: inflate ? frameCount : 0,
  };
}

/** Reads the 32-byte codec header and frame table without interpreting media. */
export function inspectCodecFile(inputPath: string): NSIGIICodecInfo {
  const parsed = parseCodec(inputPath, false);
  return {
    variant: parsed.variant, version: parsed.version, width: parsed.width, height: parsed.height,
    declaredFrameCount: parsed.declaredFrameCount, frameCount: parsed.frameCount,
    reserved: parsed.reserved, kind: parsed.kind, complete: parsed.complete,
    compressedBytes: parsed.compressedBytes,
  };
}

/** Validates raw-DEFLATE frame payloads; this never executes container data. */
export function verifyCodecFile(inputPath: string): NSIGIICodecVerifyResult {
  try {
    const info = parseCodec(inputPath, true);
    return {
      variant: "codec", readable: info.complete,
      frameCountMatch: info.declaredFrameCount === 0 || info.declaredFrameCount === info.frameCount,
      inflatedFrames: info.inflatedFrames,
    };
  } catch (error) {
    return { variant: "codec", readable: false, frameCountMatch: false, inflatedFrames: 0, error: (error as Error).message };
  }
}
