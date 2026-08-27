/**
 * NSIGII — Public SDK API
 */
export { wrapFile } from "./core/wrap.js";
export { inspectFile } from "./core/inspect.js";
export { verifyFile } from "./core/verify.js";
export { extractFile } from "./core/extract.js";
export { detectNsigiiVariant } from "./core/variant.js";
export { inspectCodecFile, verifyCodecFile } from "./core/codec.js";
export { linkArtifacts, resolveTopology } from "./core/link.js";

export type {
  NSIGIIConsensusState, NSIGIIClassification, NSIGIIChannelRole, NSIGIIRWXFlag,
  NSIGIIEnzymeAction, NSIGIIFormatHint, NSIGIIHumanRightsTag,
  NSIGIIHeader, NSIGIIChannel, NSIGIISegment, NSIGIIVerification, NSIGIIFooter,
  NSIGIIContainer, NSIGIIWrapOptions, NSIGIIVerifyResult,
} from "./types.js";
