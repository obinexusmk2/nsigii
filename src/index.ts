/**
 * NSIGII — Public SDK API
 */
export { wrapFile } from "./core/wrap.js";
export { inspectFile } from "./core/inspect.js";
export { verifyFile } from "./core/verify.js";
export { extractFile, extractPayload } from "./core/extract.js";
export { unwrapFile, unwrapBytes, MAX_UNWRAP_DEPTH } from "./core/unwrap.js";
export type { UnwrapResult, UnwrapHop, UnwrapOutcome, UnwrapOptions } from "./core/unwrap.js";
export { coreDecode, coreEncode, coreConfigured, CoreUnavailableError } from "./runtime/adapters/core.js";
export { detectNsigiiVariant } from "./core/variant.js";
export {
  detectNsigiiKind, detectNsigiiKindFromFile, describeNsigiiKind, NSIGII_KIND,
} from "./format/dispatch.js";
export type { NSIGIIKind, NSIGIIKindInfo } from "./format/dispatch.js";
export { inspectCodecFile, verifyCodecFile } from "./core/codec.js";
export { linkArtifacts, resolveTopology } from "./core/link.js";

export type {
  NSIGIIConsensusState, NSIGIIClassification, NSIGIIChannelRole, NSIGIIRWXFlag,
  NSIGIIEnzymeAction, NSIGIIFormatHint, NSIGIIHumanRightsTag,
  NSIGIIHeader, NSIGIIChannel, NSIGIISegment, NSIGIIVerification, NSIGIIFooter,
  NSIGIIContainer, NSIGIIWrapOptions, NSIGIIVerifyResult,
} from "./types.js";
