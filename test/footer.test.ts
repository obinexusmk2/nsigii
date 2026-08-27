import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { wrapFile } from "../src/core/wrap.js";
import { inspectFile } from "../src/core/inspect.js";
import { verifyFile } from "../src/core/verify.js";
import {
  FOOTER_MAGIC,
  FOOTER_MAGIC_LEGACY,
  FOOTER_SIZE,
  serializeFooter,
  deserializeFooter,
} from "../src/format/footer.js";

const TEST_DIR = resolve(__dirname, "../test/tmp");
const SAMPLE = resolve(TEST_DIR, "footer-sample.txt");
const LEGACY = resolve(TEST_DIR, "footer-legacy.nsigii");
const BROKEN = resolve(TEST_DIR, "footer-broken.nsigii");
let container: string;

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  // Payload must not itself contain the marker text — inspect() locates the
  // footer by scanning for it.
  writeFileSync(SAMPLE, "Footer marker regression fixture for the NSIGII container writer.");
  container = wrapFile(SAMPLE);
});

afterAll(() => {
  [SAMPLE, container, LEGACY, BROKEN].forEach((f) => {
    if (f && existsSync(f)) unlinkSync(f);
  });
});

describe("footer marker", () => {
  it("is the ASCII string ENDNSIGII", () => {
    expect(FOOTER_MAGIC).toBe("ENDNSIGII");
    expect(Buffer.from(FOOTER_MAGIC, "ascii")).toHaveLength(9);
    expect(FOOTER_SIZE).toBe(9 + 8 + 64 + 64);
  });

  it("terminates a freshly wrapped container", () => {
    const bytes = readFileSync(container);
    const footer = bytes.subarray(bytes.length - FOOTER_SIZE);

    expect(footer.subarray(0, FOOTER_MAGIC.length).toString("ascii")).toBe("ENDNSIGII");
    // the sentinel a third party scans for, anywhere in the trailing window
    expect(bytes.subarray(-4096).includes(Buffer.from("ENDNSIGII", "ascii"))).toBe(true);
  });

  it("round-trips through serialize/deserialize", () => {
    const finalHash = "a".repeat(64);
    const buf = serializeFooter({ segmentCount: 3, finalHash });

    expect(buf).toHaveLength(FOOTER_SIZE);
    expect(buf.subarray(0, 9).toString("ascii")).toBe("ENDNSIGII");

    const parsed = deserializeFooter(buf);
    expect(parsed.segmentCount).toBe(3);
    expect(parsed.finalHash).toBe(finalHash);
    expect(parsed.signature).toBeUndefined();
  });

  it("inspect surfaces the footer segment count and final hash", () => {
    const info = inspectFile(container);
    expect(info.footer.segmentCount).toBe(3);
    expect(info.footer.finalHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("still reads a legacy ENDSIGII-terminated container", () => {
    // Rewrite the marker in place with the pre-0.1 8-byte form.
    const bytes = Buffer.from(readFileSync(container));
    const pos = bytes.lastIndexOf(Buffer.from(FOOTER_MAGIC, "ascii"));
    expect(pos).toBeGreaterThanOrEqual(0);

    const legacyBody = Buffer.concat([
      bytes.subarray(0, pos),
      Buffer.from(FOOTER_MAGIC_LEGACY, "ascii"),
      bytes.subarray(pos + FOOTER_MAGIC.length),
    ]);
    writeFileSync(LEGACY, legacyBody);

    const info = inspectFile(LEGACY);
    expect(info.footer.segmentCount).toBe(3);
    expect(verifyFile(LEGACY).consensus).toBe("YES");
  });

  it("rejects a container whose footer marker is destroyed", () => {
    const bytes = Buffer.from(readFileSync(container));
    const pos = bytes.lastIndexOf(Buffer.from(FOOTER_MAGIC, "ascii"));
    bytes.write("XXXXXXXXX", pos, 9, "ascii");
    writeFileSync(BROKEN, bytes);

    expect(() => inspectFile(BROKEN)).toThrow(/footer not found/);
  });
});
