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
  const expectedRoles = ["TRANSMIT", "RECEIVE", "VERIFY"] as const;
  const tridentChecks = expectedRoles.map((role, index) => {
    const channel = info.channels[index];
    const segment = info.segments[index];
    const verificationHash = [info.verification.transmitHash, info.verification.receiveHash, info.verification.verifyHash][index];
    return channel?.id === index && channel.role === role && channel.hash === recomputedPayloadHash && channel.state === "SIGNAL"
      && segment?.segmentId === index && segment.channelId === index && segment.payloadHash === recomputedPayloadHash
      && segment.payloadOffset === info.payloadOffset && segment.payloadSize === info.payloadSize && segment.state === "SIGNAL"
      && verificationHash === recomputedPayloadHash;
  }) as [boolean, boolean, boolean];
  const consensusCount = tridentChecks.filter(Boolean).length;
  const channelHashMatch = consensusCount === 3;
  const recomputedFinalHash = computeFileHash(payload, recomputedChannelHash);
  const finalHashMatch = recomputedFinalHash === info.footer.finalHash;

  const rwxChainValid = info.segments.length === 3 && info.segments.every((s, i) => s.rwxFlags === [0b010, 0b100, 0b001][i]);
  const storedConsensusValid = info.verification.consensus === "YES" && info.verification.consensusScore === 1 && info.verification.segmentId === 2;

  let consensus: "YES" | "NO" | "MAYBE" = "MAYBE";
  let classification: "SIGNAL" | "NOSIGNAL" | "NOISE" | "NONOISE" = "NOISE";

  if (payloadHashMatch && channelHashMatch && finalHashMatch && rwxChainValid && storedConsensusValid) {
    consensus = "YES"; classification = "SIGNAL";
  } else if (!payloadHashMatch && !finalHashMatch) {
    consensus = "NO"; classification = "NOISE";
  } else {
    consensus = "MAYBE"; classification = "NOSIGNAL";
  }

  return { consensus, classification, payloadHashMatch, channelHashMatch, finalHashMatch, rwxChainValid, tridentChecks, consensusCount };
}
