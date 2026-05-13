import { createHash } from "node:crypto";

export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function sha256Buffer(data: Buffer | string): Buffer {
  return createHash("sha256").update(data).digest();
}

export function computeFileHash(payload: Buffer, channelsHash: Buffer): string {
  const h = createHash("sha256");
  h.update(payload);
  h.update(channelsHash);
  return h.digest("hex");
}
