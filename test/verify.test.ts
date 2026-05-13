import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { inspectFile } from "../src/core/inspect.js";
import { verifyFile } from "../src/core/verify.js";
import { wrapFile } from "../src/core/wrap.js";

const TEST_DIR = resolve(__dirname, "../test/tmp");
const SAMPLE = resolve(TEST_DIR, "verify-regression.txt");
let container: string;
const PAYLOAD_TAMPERED = resolve(TEST_DIR, "verify-regression-payload.nsigii");
const CHANNEL_TAMPERED = resolve(TEST_DIR, "verify-regression-channel.nsigii");

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(SAMPLE, "Verify final hashes from the exact channel-table bytes.");
  container = wrapFile(SAMPLE);
});

afterAll(() => {
  [SAMPLE, container, PAYLOAD_TAMPERED, CHANNEL_TAMPERED].forEach((f) => {
    if (f && existsSync(f)) unlinkSync(f);
  });
});

describe("verify", () => {
  it("accepts an untampered wrapped file", () => {
    const result = verifyFile(container);

    expect(result.consensus).toBe("YES");
    expect(result.classification).toBe("SIGNAL");
    expect(result.payloadHashMatch).toBe(true);
    expect(result.channelHashMatch).toBe(true);
    expect(result.finalHashMatch).toBe(true);
    expect(result.rwxChainValid).toBe(true);
  });

  it("rejects payload tampering after wrapping", () => {
    const info = inspectFile(container);
    const mutated = Buffer.from(readFileSync(container));
    mutated[info.payloadOffset] ^= 0xff;
    writeFileSync(PAYLOAD_TAMPERED, mutated);

    const result = verifyFile(PAYLOAD_TAMPERED);

    expect(result.consensus).not.toBe("YES");
    expect(result.payloadHashMatch).toBe(false);
    expect(result.channelHashMatch).toBe(false);
    expect(result.finalHashMatch).toBe(false);
  });

  it("rejects channel-table hash tampering after wrapping", () => {
    const info = inspectFile(container);
    const mutated = Buffer.from(readFileSync(container));
    const firstChannelHashOffset = info.channelTableOffset + 2 + info.channels[0].role.length;
    mutated[firstChannelHashOffset] = mutated[firstChannelHashOffset] === 0x30 ? 0x31 : 0x30;
    writeFileSync(CHANNEL_TAMPERED, mutated);

    const result = verifyFile(CHANNEL_TAMPERED);

    expect(result.consensus).not.toBe("YES");
    expect(result.payloadHashMatch).toBe(true);
    expect(result.channelHashMatch).toBe(false);
    expect(result.finalHashMatch).toBe(false);
  });
});
