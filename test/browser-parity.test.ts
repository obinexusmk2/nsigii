/**
 * The browser-safe constitutional module (src/browser/constitutional.ts) must
 * produce the identical verdict and payload as the authoritative Node code
 * (src/core/verify.ts + extract.ts) for every wrapper. If they drift, this
 * fails.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { wrapFile } from "../src/core/wrap.js";
import { verifyFile } from "../src/core/verify.js";
import { extractPayload } from "../src/core/extract.js";
import { inspectBytes, verifyBytes, extractBytes } from "../src/browser/constitutional.mjs";

let TMP: string;
beforeAll(() => { TMP = mkdtempSync(join(tmpdir(), "nsigii-parity-")); });
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

const payloads: [string, Buffer][] = [
  ["empty", Buffer.alloc(0)],
  ["nul", Buffer.from("a\0b\0c\0", "latin1")],
  ["text", Buffer.from("constitutional parity check payload", "utf8")],
  ["binary", randomBytes(4096)],
];

describe("browser vs Node constitutional parity", () => {
  it.each(payloads)("agrees on a clean wrapper: %s", async (name, raw) => {
    const src = join(TMP, `${name}.bin`); writeFileSync(src, raw);
    const wrapped = wrapFile(src, { outputPath: join(TMP, `${name}.nsigii`) });
    const bytes = readFileSync(wrapped);

    const node = verifyFile(wrapped);
    const web = await verifyBytes(bytes);
    expect(web.consensus).toBe("YES");
    expect(web.consensus).toBe(node.consensus);
    expect(web.consensusCount).toBe(node.consensusCount);
    expect(web.payloadHashMatch).toBe(node.payloadHashMatch);
    expect(web.finalHashMatch).toBe(node.finalHashMatch);
    expect(web.rwxChainValid).toBe(node.rwxChainValid);
    expect(web.tridentChecks).toEqual(node.tridentChecks);

    const nodePayload = extractPayload(wrapped).bytes;
    const webExtract = await extractBytes(bytes);
    expect(Buffer.from(webExtract.bytes).equals(nodePayload)).toBe(true);
    expect(webExtract.originalFilename).toBe(inspectBytes(bytes).originalFilename);
  });

  it("both reject a tampered payload byte", async () => {
    const src = join(TMP, "tamper.bin"); writeFileSync(src, Buffer.from("tamper me please"));
    const wrapped = wrapFile(src, { outputPath: join(TMP, "tamper.nsigii") });
    const buf = readFileSync(wrapped);
    buf[buf.length - 100] ^= 0xff;
    writeFileSync(wrapped, buf);

    const node = verifyFile(wrapped);
    const web = await verifyBytes(buf);
    expect(node.consensus).not.toBe("YES");
    expect(web.consensus).not.toBe("YES");
    expect(web.consensus).toBe(node.consensus);
    await expect(extractBytes(buf)).rejects.toThrow(/consensus/i);
  });

  it("both reject a tampered final hash in the footer", async () => {
    const src = join(TMP, "footer.bin"); writeFileSync(src, Buffer.from("footer integrity"));
    const wrapped = wrapFile(src, { outputPath: join(TMP, "footer.nsigii") });
    const buf = readFileSync(wrapped);
    const marker = buf.lastIndexOf(Buffer.from("ENDNSIGII"));
    buf[marker + 9 + 8 + 5] ^= 0xff; // a byte inside final_hash
    writeFileSync(wrapped, buf);

    const web = await verifyBytes(buf);
    const node = verifyFile(wrapped);
    expect(web.finalHashMatch).toBe(false);
    expect(web.consensus).toBe(node.consensus);
  });
});
