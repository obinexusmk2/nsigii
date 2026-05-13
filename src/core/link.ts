import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { inspectFile } from "./inspect.js";

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
      const info = inspectFile(r);
      return { path: r, headerHash: info.header.payloadHash, verified: true };
    } catch { return { path: r, headerHash: "", verified: false }; }
  });
}

export function resolveTopology(artifacts: LinkArtifact[]): string {
  const valid = artifacts.filter((a) => a.verified);
  if (valid.length === 0) return "NOISE";
  if (valid.length === artifacts.length) return "SIGNAL";
  return "NOSIGNAL";
}
