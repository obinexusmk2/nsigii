import { readFileSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { sha256, sha256Buffer, computeFileHash } from "../utils/hash.js";
import { detectFormatHint } from "../utils/detectFormat.js";
import { serializeHeader } from "../format/header.js";
import { serializeChannels, buildTridentChannels } from "../format/channel.js";
import { serializeSegments, buildTridentSegments } from "../format/segment.js";
import { serializeVerification, buildVerification } from "../format/verification.js";
import { serializeFooter } from "../format/footer.js";
import { NSIGII_VERSION } from "../constants.js";
import type { NSIGIIWrapOptions, NSIGIIHeader } from "../types.js";

export function wrapFile(inputPath: string, options: NSIGIIWrapOptions = {}): string {
  const resolved = resolve(inputPath);
  const payload = readFileSync(resolved);
  const payloadHash = sha256(payload);
  const formatHint = options.formatHint ?? detectFormatHint(payload);
  const originalFilename = options.originalFilename ?? basename(resolved);
  const fileId = options.fileId ?? randomUUID();

  const header: NSIGIIHeader = {
    magic: "NSIGII", version: NSIGII_VERSION, fileId,
    createdAt: new Date().toISOString(),
    originalFilename, formatHint,
    payloadSize: payload.length, payloadHash,
  };

  const channels = buildTridentChannels(payloadHash);
  const segments = buildTridentSegments(0, payload.length, payloadHash);
  const verification = buildVerification(payloadHash);

  const headerSer = serializeHeader(header);
  const channelsBuf = serializeChannels(channels);
  const segmentsBuf = serializeSegments(segments);
  const verificationBuf = serializeVerification(verification);

  const channelsHash = sha256Buffer(channelsBuf).toString("hex");
  const finalHash = computeFileHash(payload, Buffer.from(channelsHash, "hex"));
  const footerBuf = serializeFooter({ segmentCount: segments.length, finalHash });

  const headerLen = headerSer.buffer.length;
  const channelTableOffset = headerLen;
  const segmentTableOffset = channelTableOffset + channelsBuf.length;
  const verificationOffset = segmentTableOffset + segmentsBuf.length;
  const payloadOffset = verificationOffset + verificationBuf.length;

  headerSer.buffer.writeBigUInt64LE(BigInt(channelTableOffset), headerSer.channelTableOffsetPos);
  headerSer.buffer.writeBigUInt64LE(BigInt(segmentTableOffset), headerSer.segmentTableOffsetPos);
  headerSer.buffer.writeBigUInt64LE(BigInt(payloadOffset), headerSer.payloadOffsetPos);

  for (let i = 0; i < segments.length; i++) segments[i].payloadOffset = payloadOffset;
  const patchedSegmentsBuf = serializeSegments(segments);

  const totalSize = headerLen + channelsBuf.length + patchedSegmentsBuf.length + verificationBuf.length + payload.length + footerBuf.length;
  const out = Buffer.alloc(totalSize);
  let off = 0;
  headerSer.buffer.copy(out, off); off += headerLen;
  channelsBuf.copy(out, off); off += channelsBuf.length;
  patchedSegmentsBuf.copy(out, off); off += patchedSegmentsBuf.length;
  verificationBuf.copy(out, off); off += verificationBuf.length;
  payload.copy(out, off); off += payload.length;
  footerBuf.copy(out, off); off += footerBuf.length;

  const outputPath = resolved + ".nsigii";
  writeFileSync(outputPath, out);
  return outputPath;
}
