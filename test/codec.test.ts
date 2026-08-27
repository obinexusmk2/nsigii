import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { detectNsigiiVariant, inspectCodecFile, verifyCodecFile } from "../src/index.js";

describe("codec stream reference layout", () => {
  it("reads the same 32-byte, raw-DEFLATE layout produced by the Python donut reference", () => {
    const dir = mkdtempSync(join(tmpdir(), "nsigii-codec-"));
    const path = join(dir, "python-reference.nsigii");
    try {
      const header = Buffer.alloc(32);
      header.write("NSIGII\0\0", 0, "latin1");
      header.write("7.1.0A", 8, "ascii");
      header.writeUInt32LE(2, 16); header.writeUInt32LE(2, 20);
      header.writeUInt32LE(1, 24); header.writeUInt32LE((1 << 16) | 1, 28);
      const raw = Buffer.from("abcdRGBRGBRGBRGB", "ascii");
      const compressed = deflateRawSync(raw);
      const frameSize = Buffer.alloc(4); frameSize.writeUInt32LE(compressed.length);
      writeFileSync(path, Buffer.concat([header, frameSize, compressed]));

      expect(detectNsigiiVariant(path)).toBe("codec");
      expect(inspectCodecFile(path)).toMatchObject({ kind: "ascii", width: 2, height: 2, frameCount: 1, complete: true });
      expect(verifyCodecFile(path)).toMatchObject({ readable: true, frameCountMatch: true, inflatedFrames: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
