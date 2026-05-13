import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sha256, sha256Buffer, computeFileHash } from "../utils/hash.js";
import { inspectFile } from "./inspect.js";
import type { NSIGIIVerifyResult } from "../types.js";

export function verifyFile(inputPath: string): NSIGIIVerifyResult {
  const resolved = resolve(inputPath);
  const buf = readFileSync(resolved);
  const info = inspectFile(inputPath);

  const payload = buf.subarray(info.payloadOffset, info.payloadOffset + info.payloadSize);
  const recomputedPayloadHash = sha256(payload);
  const payloadHashMatch = recomputedPayloadHash === info.header.payloadHash;

  const channelsBuf = buf.subarray(info.channelTableOffset, info.segmentTableOffset);
  const recomputedChannelHash = sha256Buffer(channelsBuf);
  const channelHashMatch = info.channels.every((channel) => channel.hash === recomputedPayloadHash);
  const recomputedFinalHash = computeFileHash(payload, recomputedChannelHash);
  const finalHashMatch = recomputedFinalHash === info.footer.finalHash;

  const rwxChainValid = info.segments.every((s, i) => s.rwxFlags === [0b010, 0b100, 0b001][i]);

  let consensus: "YES" | "NO" | "MAYBE" = "MAYBE";
  let classification: "SIGNAL" | "NOSIGNAL" | "NOISE" | "NONOISE" = "NOISE";

  if (payloadHashMatch && channelHashMatch && finalHashMatch && rwxChainValid) {
    consensus = "YES"; classification = "SIGNAL";
  } else if (!payloadHashMatch && !finalHashMatch) {
    consensus = "NO"; classification = "NOISE";
  } else {
    consensus = "MAYBE"; classification = "NOSIGNAL";
  }

  return { consensus, classification, payloadHashMatch, channelHashMatch, finalHashMatch, rwxChainValid };
}
