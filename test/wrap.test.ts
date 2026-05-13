import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { wrapFile } from "../src/core/wrap.js";
import { inspectFile } from "../src/core/inspect.js";
import { verifyFile } from "../src/core/verify.js";
import { extractFile } from "../src/core/extract.js";

const TEST_DIR = resolve(__dirname, "../test/tmp");
const SAMPLE = resolve(TEST_DIR, "sample.txt");
const CONTAINER = resolve(TEST_DIR, "sample.txt.nsigii");

beforeAll(() => { mkdirSync(TEST_DIR, { recursive: true }); writeFileSync(SAMPLE, "Hello, NSIGII constitutional computing."); });
afterAll(() => {
  [SAMPLE, CONTAINER, resolve(TEST_DIR, "sample.txt")].forEach((f) => { if (existsSync(f)) unlinkSync(f); });
});

describe("wrap", () => {
  it("creates a .nsigii container", () => {
    const out = wrapFile(SAMPLE);
    expect(existsSync(out)).toBe(true);
    expect(out.endsWith(".nsigii")).toBe(true);
  });
});

describe("inspect", () => {
  it("parses header metadata", () => {
    const info = inspectFile(CONTAINER);
    expect(info.header.magic).toBe("NSIGII");
    expect(info.header.version).toBe("7.0.0");
    expect(info.header.payloadSize).toBeGreaterThan(0);
    expect(info.channels.length).toBe(3);
  });
});

describe("verify", () => {
  it("returns YES for untampered container", () => {
    const result = verifyFile(CONTAINER);
    expect(result.consensus).toBe("YES");
    expect(result.classification).toBe("SIGNAL");
    expect(result.payloadHashMatch).toBe(true);
    expect(result.rwxChainValid).toBe(true);
  });
});

describe("extract", () => {
  it("recovers original payload", () => {
    const result = extractFile(CONTAINER);
    expect(result.verified).toBe(true);
    expect(existsSync(result.outputPath)).toBe(true);
  });
});
