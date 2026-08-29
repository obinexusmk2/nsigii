/**
 * Cross-repo integration matrix (brief items A–K, minus the browser cases E/F/G
 * which live in the viewer repo's CI).
 *
 * Needs the C core: set NSIGII_C_BIN to the `nsigii` binary from
 * obinexus/nsigii_project. Items C and D additionally need the real legacy
 * donut: set NSIGII_DONUT to its path, or NSIGII_VIEWER_REPO to a checkout of
 * obinexus/nsigii_viewer. Missing prerequisites skip, they do not fail.
 *
 * Pinned revisions the CI checks out are in ./repos.lock.json.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { coreEncode, coreDecode } from "../../src/runtime/adapters/core.js";
import { wrapFile } from "../../src/core/wrap.js";
import { verifyFile } from "../../src/core/verify.js";
import { extractPayload } from "../../src/core/extract.js";
import { unwrapBytes } from "../../src/core/unwrap.js";
import { detectNsigiiKind, NSIGII_KIND } from "../../src/format/dispatch.js";

const HAVE_CORE = Boolean(process.env.NSIGII_C_BIN);
const DONUT =
  process.env.NSIGII_DONUT ||
  (process.env.NSIGII_VIEWER_REPO ? resolve(process.env.NSIGII_VIEWER_REPO, "donut.nsigii") : "");
const HAVE_DONUT = Boolean(DONUT) && existsSync(DONUT);

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe.skipIf(!HAVE_CORE)("cross-repo roundtrip matrix", () => {
  let work: string;
  beforeAll(() => { work = mkdtempSync(join(tmpdir(), "nsigii-itest-")); });
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  const coreFile = (raw: Buffer, name: string) => {
    const p = join(work, name);
    writeFileSync(p, coreEncode(raw));
    return p;
  };

  it("A — raw -> C encode -> C decode -> byte-for-byte identical", () => {
    const raw = randomBytes(5000);
    const dec = coreDecode(coreEncode(raw)).bytes;
    expect(dec.equals(raw)).toBe(true);
    expect(sha(dec)).toBe(sha(raw));
  });

  it("B — raw -> C encode -> wrap -> verify -> extract -> C decode -> identical", () => {
    const raw = randomBytes(5000);
    const wrapped = wrapFile(coreFile(raw, "b.core.nsigii"), { outputPath: join(work, "b.wrapped.nsigii") });
    expect(verifyFile(wrapped).consensus).toBe("YES");
    const inner = extractPayload(wrapped).bytes;
    expect(detectNsigiiKind(inner)).toBe(NSIGII_KIND.CORE_V1);
    expect(sha(coreDecode(inner).bytes)).toBe(sha(raw));
  });

  it.skipIf(!HAVE_DONUT)("C — legacy donut -> C encode -> C decode -> exact donut bytes", () => {
    const donut = readFileSync(DONUT);
    expect(detectNsigiiKind(donut)).toBe(NSIGII_KIND.LEGACY_CODEC_STREAM);
    const dec = coreDecode(coreEncode(donut)).bytes;
    expect(dec.length).toBe(donut.length);
    expect(sha(dec)).toBe(sha(donut));
  });

  it.skipIf(!HAVE_DONUT)("D — legacy donut -> C encode -> wrap -> verify -> extract -> C decode -> exact donut", () => {
    const donut = readFileSync(DONUT);
    const wrapped = wrapFile(coreFile(donut, "d.core.nsigii"), { outputPath: join(work, "d.wrapped.nsigii") });
    expect(verifyFile(wrapped).consensus).toBe("YES");
    const res = unwrapBytes(readFileSync(wrapped));
    expect(res.chain.map((h) => h.kind)).toEqual([
      NSIGII_KIND.CONSTITUTIONAL_WRAPPER, NSIGII_KIND.CORE_V1, NSIGII_KIND.LEGACY_CODEC_STREAM,
    ]);
    expect(res.outcome).toBe("resolved");
    expect(sha(res.finalBytes)).toBe(sha(donut));
  });

  it("H — a corrupted CORE_V1 fails to decode (CRC-32 / structure)", () => {
    const enc = coreEncode(randomBytes(4096));
    const flipCrc = Buffer.from(enc); flipCrc[flipCrc.length - 8] ^= 0xff; // footer CRC field
    expect(() => coreDecode(flipCrc)).toThrow();
    const flipPayload = Buffer.from(enc); flipPayload[40] ^= 0x01;
    expect(() => coreDecode(flipPayload)).toThrow();
    expect(() => coreDecode(enc.subarray(0, enc.length - 4))).toThrow(); // truncated footer
  });

  it("I — a tampered constitutional payload fails verification and blocks extraction", () => {
    const src = join(work, "i.txt"); writeFileSync(src, "constitutional integrity");
    const wrapped = wrapFile(src, { outputPath: join(work, "i.nsigii") });
    const buf = readFileSync(wrapped); buf[buf.length - 100] ^= 0xff; writeFileSync(wrapped, buf);
    expect(verifyFile(wrapped).consensus).not.toBe("YES");
    expect(() => extractPayload(wrapped)).toThrow(/consensus/i);
    expect(unwrapBytes(readFileSync(wrapped)).outcome).toBe("verify-failed");
  });

  it("J — an unknown / script-shaped payload is classified inert and never executed", () => {
    const marker = join(work, "NSIGII_J_MARKER");
    const shellish = Buffer.from(`#!/bin/sh\ntouch ${JSON.stringify(marker)}\n`, "utf8");
    const wrapped = wrapFile(coreFile(shellish, "j.core.nsigii"), { outputPath: join(work, "j.wrapped.nsigii") });
    const res = unwrapBytes(readFileSync(wrapped));
    expect(res.outcome).toBe("resolved");
    expect(res.finalKind).toBe(NSIGII_KIND.UNKNOWN);
    expect(res.finalBytes.equals(shellish)).toBe(true);
    expect(existsSync(marker)).toBe(false);
  });

  it("K — empty payload and embedded NUL bytes survive every applicable round trip", () => {
    const cases: Buffer[] = [
      Buffer.alloc(0),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from("a\0b\0c\0", "latin1"),
      Buffer.concat([randomBytes(400), Buffer.alloc(64), randomBytes(400)]),
    ];
    cases.forEach((raw, i) => {
      // A path
      expect(sha(coreDecode(coreEncode(raw)).bytes)).toBe(sha(raw));
      // wrapper-only path
      const rf = join(work, `k${i}.raw`); writeFileSync(rf, raw);
      const w1 = wrapFile(rf, { outputPath: join(work, `k${i}.w1.nsigii`) });
      expect(verifyFile(w1).consensus).toBe("YES");
      expect(sha(extractPayload(w1).bytes)).toBe(sha(raw));
      // B path
      const w2 = wrapFile(coreFile(raw, `k${i}.core.nsigii`), { outputPath: join(work, `k${i}.w2.nsigii`) });
      expect(sha(coreDecode(extractPayload(w2).bytes).bytes)).toBe(sha(raw));
    });
  });
});
