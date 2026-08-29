import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectNsigiiKind, NSIGII_KIND } from "../format/dispatch.js";

export type NSIGIIVariant = "wrapper" | "codec";

/**
 * The two NSIGII layouts this package reads directly: the constitutional
 * wrapper and the legacy codec stream.
 *
 * @deprecated Prefer {@link detectNsigiiKind} / `detectNsigiiKindFromFile`,
 * which also classify `CORE_V1` and `UNKNOWN`. This helper is kept for callers
 * that only branch wrapper-vs-codec; it throws for the other two kinds.
 */
export function detectNsigiiVariant(inputPath: string): NSIGIIVariant {
  const kind = detectNsigiiKind(readFileSync(resolve(inputPath)));
  switch (kind) {
    case NSIGII_KIND.CONSTITUTIONAL_WRAPPER:
      return "wrapper";
    case NSIGII_KIND.LEGACY_CODEC_STREAM:
      return "codec";
    case NSIGII_KIND.CORE_V1:
      throw new Error(
        "This is a CORE_V1 byte container (NSIGII01), not a wrapper or codec stream. " +
          "Decode it with the C core (obinexus/nsigii_project) — `nsigii dispatch <file>` identifies it.",
      );
    default:
      throw new Error("Not an NSIGII file: expected the NSIGII magic header");
  }
}
