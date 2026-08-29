import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  detectNsigiiKind, detectNsigiiKindFromFile, describeNsigiiKind, NSIGII_KIND,
} from "../src/format/dispatch.js";
import { detectNsigiiVariant } from "../src/core/variant.js";
import { wrapFile } from "../src/core/wrap.js";

const FIX = resolve(__dirname, "fixtures");
const TMP = resolve(__dirname, "tmp");
const SAMPLE = resolve(TMP, "dispatch-sample.txt");
let wrapper: string;

/** Build an 8-byte head: "NSIGII" + byte6 + byte7. */
const head = (b6: number, b7: number) => Buffer.from([0x4e, 0x53, 0x49, 0x47, 0x49, 0x49, b6, b7]);

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  writeFileSync(SAMPLE, "dispatch wrapper fixture payload");
  wrapper = wrapFile(SAMPLE); // carries a timestamp — built here, not committed
});

afterAll(() => {
  [SAMPLE, wrapper].forEach((f) => { if (f && existsSync(f)) unlinkSync(f); });
});

describe("detectNsigiiKind — byte-level", () => {
  it("classifies the three magics", () => {
    expect(detectNsigiiKind(Buffer.from("NSIGII01", "ascii"))).toBe(NSIGII_KIND.CORE_V1);
    expect(detectNsigiiKind(head(0x00, 0x07))).toBe(NSIGII_KIND.CONSTITUTIONAL_WRAPPER);
    expect(detectNsigiiKind(head(0x00, 0x00))).toBe(NSIGII_KIND.LEGACY_CODEC_STREAM);
  });

  it("is UNKNOWN for anything else", () => {
    expect(detectNsigiiKind(Buffer.alloc(0))).toBe(NSIGII_KIND.UNKNOWN);
    expect(detectNsigiiKind(Buffer.from("NSIGII0", "ascii"))).toBe(NSIGII_KIND.UNKNOWN); // 7 bytes
    expect(detectNsigiiKind(Buffer.from("NSIGII0X", "ascii"))).toBe(NSIGII_KIND.UNKNOWN); // "01" only
    expect(detectNsigiiKind(head(0x00, 0x01))).toBe(NSIGII_KIND.UNKNOWN); // reserved byte-7 value
    expect(detectNsigiiKind(head(0x01, 0x07))).toBe(NSIGII_KIND.UNKNOWN); // byte-6 not NUL
    expect(detectNsigiiKind(Buffer.from("PKabcd", "latin1"))).toBe(NSIGII_KIND.UNKNOWN);
    expect(detectNsigiiKind(Buffer.from("hello world\n", "utf8"))).toBe(NSIGII_KIND.UNKNOWN);
  });

  it("does not confuse CORE_V1 with the NUL-padded wrapper/legacy prefix", () => {
    // "NSIGII01" has byte6=0x30 ('0'), byte7=0x31 ('1') — must not fall into the NSIGII\0 arms
    const b = Buffer.from("NSIGII01", "ascii");
    expect(b[6]).toBe(0x30);
    expect(detectNsigiiKind(b)).toBe(NSIGII_KIND.CORE_V1);
  });
});

describe("detectNsigiiKindFromFile — committed fixtures", () => {
  const cases: [string, string][] = [
    ["core-v1.min.nsigii", NSIGII_KIND.CORE_V1],
    ["legacy-7.1.0A.min.nsigii", NSIGII_KIND.LEGACY_CODEC_STREAM],
    ["empty.bin", NSIGII_KIND.UNKNOWN],
    ["short.bin", NSIGII_KIND.UNKNOWN],
    ["hello.txt", NSIGII_KIND.UNKNOWN],
    ["nul-bytes.bin", NSIGII_KIND.UNKNOWN],
  ];
  it.each(cases)("%s -> %s", (name, expected) => {
    expect(detectNsigiiKindFromFile(resolve(FIX, name))).toBe(expected);
  });

  it("classifies a freshly wrapped file as CONSTITUTIONAL_WRAPPER", () => {
    expect(detectNsigiiKindFromFile(wrapper)).toBe(NSIGII_KIND.CONSTITUTIONAL_WRAPPER);
  });
});

describe("detectNsigiiVariant — back-compat shim", () => {
  it("still maps the two directly-handled kinds", () => {
    expect(detectNsigiiVariant(wrapper)).toBe("wrapper");
    expect(detectNsigiiVariant(resolve(FIX, "legacy-7.1.0A.min.nsigii"))).toBe("codec");
  });

  it("throws a CORE_V1-specific message rather than a generic one", () => {
    expect(() => detectNsigiiVariant(resolve(FIX, "core-v1.min.nsigii"))).toThrow(/CORE_V1/);
  });

  it("throws for non-NSIGII input", () => {
    expect(() => detectNsigiiVariant(resolve(FIX, "hello.txt"))).toThrow(/Not an NSIGII file/);
  });
});

describe("describeNsigiiKind", () => {
  it("names an owner and a next action for every kind", () => {
    for (const kind of Object.values(NSIGII_KIND)) {
      const info = describeNsigiiKind(kind);
      expect(info.kind).toBe(kind);
      expect(info.owner.length).toBeGreaterThan(0);
      expect(info.nextAction.length).toBeGreaterThan(0);
    }
  });

  it("never invites executing a payload; UNKNOWN explicitly forbids it", () => {
    for (const kind of [NSIGII_KIND.CORE_V1, NSIGII_KIND.CONSTITUTIONAL_WRAPPER, NSIGII_KIND.LEGACY_CODEC_STREAM]) {
      expect(describeNsigiiKind(kind).nextAction.toLowerCase()).not.toContain("execut");
    }
    expect(describeNsigiiKind(NSIGII_KIND.UNKNOWN).nextAction.toLowerCase()).toMatch(/never.*execute/);
  });
});
