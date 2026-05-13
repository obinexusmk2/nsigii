import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inspectFile } from "../src/core/inspect.js";
import { wrapFile } from "../src/core/wrap.js";
import { writeFileSync, unlinkSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const TEST_DIR = resolve(__dirname, "../test/tmp");
const TMP = resolve(TEST_DIR, "inspect-sample.bin");
const TEXT_SAMPLE = resolve(TEST_DIR, "inspect-sample.txt");
let container: string;
let textContainer: string;

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(TMP, Buffer.from([0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00]));
  writeFileSync(TEXT_SAMPLE, "Hello from NSIGII inspect regression.");
  container = wrapFile(TMP);
  textContainer = wrapFile(TEXT_SAMPLE);
});

afterAll(() => {
  [TMP, container, TEXT_SAMPLE, textContainer].forEach((f) => { if (f && existsSync(f)) unlinkSync(f); });
});

describe("inspect", () => {
  it("reads trident channels", () => {
    const info = inspectFile(container);
    expect(info.channels[0].role).toBe("TRANSMIT");
    expect(info.channels[1].role).toBe("RECEIVE");
    expect(info.channels[2].role).toBe("VERIFY");
  });
  it("reads verification block", () => {
    const info = inspectFile(container);
    expect(info.verification.consensus).toBe("YES");
    expect(info.verification.consensusScore).toBe(1.0);
    expect(info.verification.humanRightsTag).toBe("VERIFY");
  });
  it("parses a wrapped text file with a payload offset inside the container", () => {
    const info = inspectFile(textContainer);
    const generated = readFileSync(textContainer);

    expect(info.header.formatHint).toBe("text");
    expect(info.payloadOffset).toBeGreaterThanOrEqual(0);
    expect(info.payloadOffset).toBeLessThan(generated.length);
    expect(info.payloadOffset + info.payloadSize).toBeLessThanOrEqual(generated.length);
  });
});
