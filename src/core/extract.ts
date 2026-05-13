import { readFileSync, writeFileSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";
import { inspectFile } from "./inspect.js";
import { verifyFile } from "./verify.js";

export interface ExtractResult {
  outputPath: string;
  verified: boolean;
  consensus: string;
}

export function extractFile(inputPath: string, outputPath?: string): ExtractResult {
  const resolved = resolve(inputPath);
  const buf = readFileSync(resolved);
  const info = inspectFile(inputPath);
  const verifyResult = verifyFile(inputPath);

  if (verifyResult.consensus === "NO") throw new Error("NSIGII container verification failed — extraction blocked");

  const payload = buf.subarray(info.payloadOffset, info.payloadOffset + info.payloadSize);
  const dest = outputPath
    ? resolve(outputPath)
    : resolve(dirname(resolved), info.header.originalFilename ?? basename(resolved).replace(/\.nsigii$/, ".extracted"));

  writeFileSync(dest, payload);
  return { outputPath: dest, verified: verifyResult.consensus === "YES", consensus: verifyResult.consensus };
}
