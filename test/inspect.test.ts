import { describe, it, expect } from "vitest";
import { inspectFile } from "../src/core/inspect.js";
import { wrapFile } from "../src/core/wrap.js";
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TMP = resolve(__dirname, "../test/tmp/inspect-sample.bin");
mkdirSync(resolve(__dirname, "../test/tmp"), { recursive: true });
writeFileSync(TMP, Buffer.from([0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00]));
const CONTAINER = wrapFile(TMP);

describe("inspect", () => {
  it("reads trident channels", () => {
    const info = inspectFile(CONTAINER);
    expect(info.channels[0].role).toBe("TRANSMIT");
    expect(info.channels[1].role).toBe("RECEIVE");
    expect(info.channels[2].role).toBe("VERIFY");
  });
  it("reads verification block", () => {
    const info = inspectFile(CONTAINER);
    expect(info.verification.consensus).toBe("YES");
    expect(info.verification.consensusScore).toBe(1.0);
    expect(info.verification.humanRightsTag).toBe("VERIFY");
  });
});

unlinkSync(TMP);
unlinkSync(CONTAINER);
