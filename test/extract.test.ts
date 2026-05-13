import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { wrapFile, extractFile } from "../src/index.js";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TEST_DIR = resolve(__dirname, "../test/tmp");
const TMP = resolve(TEST_DIR, "extract-sample.txt");
const PAYLOAD = "NSIGII extraction test payload.";
let container: string;
let outputPath: string | undefined;

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(TMP, PAYLOAD);
  container = wrapFile(TMP);
});

afterAll(() => {
  [TMP, container, outputPath].forEach((f) => { if (f && existsSync(f)) unlinkSync(f); });
});

describe("extract", () => {
  it("restores exact bytes", () => {
    const result = extractFile(container);
    outputPath = result.outputPath;
    const restored = readFileSync(result.outputPath, "utf8");
    expect(restored).toBe(PAYLOAD);
  });
});
