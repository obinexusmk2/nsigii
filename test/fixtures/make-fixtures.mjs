/**
 * Regenerate the committed dispatch/round-trip fixtures in this directory.
 *
 *   node test/fixtures/make-fixtures.mjs
 *
 * Every fixture here is tiny and deterministic. Non-deterministic artifacts
 * (constitutional wrappers carry a timestamp + random file id) are built at test
 * time into test/tmp/ instead, not committed.
 *
 * CORE_V1 is produced by the real C core, never re-encoded in JavaScript. Point
 * NSIGII_C_BIN at the `nsigii` binary from obinexus/nsigii_project (default:
 * ../nsigii_project/build/nsigii relative to this repo). If it is missing, the
 * CORE_V1 fixture is skipped with a notice and the rest still regenerate.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const out = (name) => resolve(HERE, name);

mkdirSync(HERE, { recursive: true });

/* --- UNKNOWN / plain inputs ------------------------------------------------ */
writeFileSync(out("empty.bin"), Buffer.alloc(0));
writeFileSync(out("short.bin"), Buffer.from("NSIG", "ascii")); // < 8 bytes
writeFileSync(out("hello.txt"), Buffer.from("hello world\n", "utf8"));
writeFileSync(out("nul-bytes.bin"), Buffer.from([0x61, 0x00, 0x62, 0x00, 0x63])); // a\0b\0c

/* --- LEGACY_CODEC_STREAM: minimal real 7.1.0A ---------------------------------
 * 2x2 rotation grid, 4x3 cells, 4 frames. Four planar w*h byte planes per frame
 * (chars | r | g | b), raw DEFLATE — exactly the layout in
 * nsigii_viewer/FORMAT-LEGACY.md and donut_nsigii.py.
 */
{
  const w = 4, h = 3, gridA = 2, gridB = 2;
  const header = Buffer.alloc(32);
  header.write("NSIGII\0\0", 0, "latin1");
  header.write("7.1.0A", 8, "ascii");
  header.writeUInt32LE(w, 16);
  header.writeUInt32LE(h, 20);
  header.writeUInt32LE(gridA * gridB, 24);
  header.writeUInt32LE((gridA << 16) | gridB, 28);

  const parts = [header];
  for (let a = 0; a < gridA; a++) {
    for (let b = 0; b < gridB; b++) {
      const size = w * h;
      const chars = Buffer.alloc(size, 0x20); // spaces
      chars[a * gridB + b] = ".,:;".charCodeAt((a * gridB + b) % 4); // one glyph, varies per cell
      const red = Buffer.alloc(size, 10 * (a + 1));
      const green = Buffer.alloc(size, 10 * (b + 1));
      const blue = Buffer.alloc(size, 7);
      const frame = deflateRawSync(Buffer.concat([chars, red, green, blue]), { level: 9 });
      const len = Buffer.alloc(4);
      len.writeUInt32LE(frame.length);
      parts.push(len, frame);
    }
  }
  writeFileSync(out("legacy-7.1.0A.min.nsigii"), Buffer.concat(parts));
}

/* --- CORE_V1: produced by the real C core ---------------------------------- */
{
  const bin = process.env.NSIGII_C_BIN || resolve(REPO, "../nsigii_project/build/nsigii");
  const payload = out(".core-v1.payload");
  writeFileSync(payload, Buffer.from([0x00, 0x01, 0x02, 0xff, 0x4e, 0x53, 0x00])); // 7 bytes incl. NUL + 0xFF
  try {
    if (existsSync(bin)) {
      execFileSync(bin, ["pack", payload, out("core-v1.min.nsigii")], { stdio: "ignore" });
      console.log("core-v1.min.nsigii   <- " + bin);
    } else {
      console.warn("core-v1.min.nsigii   SKIPPED — C core not found at " + bin);
      console.warn("                     set NSIGII_C_BIN or build obinexus/nsigii_project");
    }
  } finally {
    rmSync(payload, { force: true });
  }
}

console.log("fixtures regenerated in " + HERE);
