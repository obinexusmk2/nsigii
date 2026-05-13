import { describe, it, expect } from "vitest";
import { wrapFile, extractFile } from "../src/index.js";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TMP = resolve(__dirname, "../test/tmp/extract-sample.txt");
const PAYLOAD = "NSIGII extraction test payload.";
mkdirSync(resolve(__dirname, "../test/tmp"), { recursive: true });
writeFileSync(TMP, PAYLOAD);
const CONTAINER = wrapFile(TMP);

describe("extract", () => {
  it("restores exact bytes", () => {
    const result = extractFile(CONTAINER);
    const restored = readFileSync(result.outputPath, "utf8");
    expect(restored).toBe(PAYLOAD);
  });
});

unlinkSync(TMP);
unlinkSync(CONTAINER);
