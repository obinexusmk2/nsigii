import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { inspectFile } from "./inspect.js";
import { inspectCodecFile } from "./codec.js";
import { detectNsigiiVariant } from "./variant.js";
import { verifyFile } from "./verify.js";

export interface LinkArtifact {
  path: string;
  headerHash: string;
  verified: boolean;
}

export function linkArtifacts(paths: string[]): LinkArtifact[] {
  return paths.map((p) => {
    const r = resolve(p);
    if (!existsSync(r)) return { path: r, headerHash: "", verified: false };
    try {
      if (detectNsigiiVariant(r) === "codec") {
        const info = inspectCodecFile(r);
        return { path: r, headerHash: `${info.version}:${info.width}x${info.height}:${info.frameCount}`, verified: info.complete };
      }
      const info = inspectFile(r);
      return { path: r, headerHash: info.header.payloadHash, verified: verifyFile(r).consensus === "YES" };
    } catch { return { path: r, headerHash: "", verified: false }; }
  });
}

export function resolveTopology(artifacts: LinkArtifact[]): string {
  const valid = artifacts.filter((a) => a.verified);
  if (valid.length === 0) return "NOISE";
  if (valid.length === artifacts.length) return "SIGNAL";
  return "NOSIGNAL";
}
