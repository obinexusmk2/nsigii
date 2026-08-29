import { readFileSync, writeFileSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";
import { inspectFile } from "./inspect.js";
import { verifyFile } from "./verify.js";

export interface ExtractResult {
  outputPath: string;
  verified: boolean;
  consensus: string;
}

export interface ExtractedPayload {
  bytes: Buffer;
  originalFilename?: string;
  verified: boolean;
  consensus: string;
}

/**
 * Verify a constitutional wrapper and return its payload bytes in memory.
 * Throws unless consensus reaches 3/3 `YES` — verification gates extraction.
 */
export function extractPayload(inputPath: string): ExtractedPayload {
  const resolved = resolve(inputPath);
  const buf = readFileSync(resolved);
  const info = inspectFile(inputPath);
  const verifyResult = verifyFile(inputPath);

  if (verifyResult.consensus !== "YES") {
    throw new Error(`NSIGII container did not reach required 3/3 verification consensus (${verifyResult.consensusCount}/3) — extraction blocked`);
  }

  return {
    bytes: buf.subarray(info.payloadOffset, info.payloadOffset + info.payloadSize),
    originalFilename: info.header.originalFilename,
    verified: true,
    consensus: verifyResult.consensus,
  };
}

export function extractFile(inputPath: string, outputPath?: string): ExtractResult {
  const resolved = resolve(inputPath);
  const { bytes, originalFilename, verified, consensus } = extractPayload(inputPath);

  const dest = outputPath
    ? resolve(outputPath)
    : resolve(dirname(resolved), originalFilename ?? basename(resolved).replace(/\.nsigii$/, ".extracted"));

  writeFileSync(dest, bytes);
  return { outputPath: dest, verified, consensus };
}
