/**
 * Cross-check the container writer against examples/nsigii-viewer.html.
 *
 * The viewer renders the NSIGII *codec stream* (version "7.0.0" / "7.1.0A") and
 * also displays a receipt for the *constitutional wrapper* this package writes.
 * This test lifts `readHeader` straight out of the HTML and runs it on real output.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { wrapFile } from "../src/core/wrap.js";

const VIEWER = resolve(__dirname, "../examples/nsigii-viewer.html");
const TEST_DIR = resolve(__dirname, "../test/tmp");
const SAMPLE = resolve(TEST_DIR, "viewer-sample.txt");
let container: string;

/** Pull the viewer's header parser out of the page and evaluate it in isolation. */
function loadViewerReadHeader(html: string): (buf: ArrayBuffer) => unknown {
  const grab = (re: RegExp, what: string): string => {
    const m = html.match(re);
    if (!m) throw new Error(`could not find ${what} in nsigii-viewer.html`);
    return m[0];
  };
  const src = [
    grab(/const HDR = \d+;/, "HDR constant"),
    grab(/const MAGIC = "[^"]+";/, "MAGIC constant"),
    grab(/function ascii\(bytes, off, len\) \{[\s\S]*?\n\}/, "ascii()"),
    grab(/function readHeader\(buf\) \{[\s\S]*?\n\}/, "readHeader()"),
    "return readHeader;",
  ].join("\n");
  // eslint-disable-next-line no-new-func
  return new Function(src)() as (buf: ArrayBuffer) => unknown;
}

const bufferToArrayBuffer = (b: Buffer): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(SAMPLE, "payload the viewer should route to `npx nsigii extract`");
  container = wrapFile(SAMPLE);
});

afterAll(() => {
  [SAMPLE, container].forEach((f) => {
    if (f && existsSync(f)) unlinkSync(f);
  });
});

describe("examples/nsigii-viewer.html", () => {
  it("recognises the ENDNSIGII sentinel without asking the viewer to execute data", () => {
    const html = readFileSync(VIEWER, "utf8");
    expect(html).toContain('tail.includes("ENDNSIGII")');
    expect(html).toContain("This viewer displays the container receipt only");
    expect(html).toContain("does not execute");
  });

  it("opens a wrapped container as a constitutional wrapper receipt", () => {
    const readHeader = loadViewerReadHeader(readFileSync(VIEWER, "utf8"));
    const bytes = readFileSync(container);
    const header = readHeader(bufferToArrayBuffer(bytes)) as { variant: string; payloadSize: number };
    expect(header.variant).toBe("wrapper");
    expect(header.payloadSize).toBeGreaterThan(0);
  });

  it("satisfies both of the viewer's wrapper signals", () => {
    const bytes = readFileSync(container);
    // signal 1: magic is 7 bytes, so byte[7] is version_major 0x07
    expect(bytes.subarray(0, 6).toString("ascii")).toBe("NSIGII");
    expect(bytes[7]).toBe(0x07);
    // signal 2: the trailing window carries the ENDNSIGII marker
    const tail = bytes.subarray(Math.max(0, bytes.length - 4096)).toString("latin1");
    expect(tail.includes("ENDNSIGII")).toBe(true);
  });

  it("does not misfire on a codec-stream header the viewer renders", () => {
    const readHeader = loadViewerReadHeader(readFileSync(VIEWER, "utf8"));
    // Minimal 32-byte codec header: 8-byte magic "NSIGII\0\0", then "7.1.0A".
    const codec = Buffer.alloc(32);
    codec.write("NSIGII\0\0", 0, "latin1");
    codec.write("7.1.0A", 8, "ascii");

    const header = readHeader(bufferToArrayBuffer(codec)) as { variant: string; version: string };
    expect(header.variant).toBe("codec");
    expect(header.version).toBe("7.1.0A");
  });
});
