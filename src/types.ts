/**
 * NSIGII — Type System
 */

export type NSIGIIConsensusState = "YES" | "NO" | "MAYBE";
export type NSIGIIClassification = "SIGNAL" | "NOSIGNAL" | "NOISE" | "NONOISE";
export type NSIGIIChannelRole = "TRANSMIT" | "RECEIVE" | "VERIFY";
export type NSIGIIRWXFlag = "READ" | "WRITE" | "EXECUTE";
export type NSIGIIEnzymeAction = "CREATE" | "DESTROY" | "BUILD" | "BREAK" | "REPAIR" | "RENEW";
export type NSIGIIFormatHint = "archive" | "video" | "audio" | "text" | "wasm" | "binary" | "mixed" | "unknown";
export type NSIGIIHumanRightsTag = "NONE" | "TRANSMIT" | "RECEIVE" | "VERIFY" | "ARCHIVE" | "EVIDENCE";

export interface NSIGIIHeader {
  magic: "NSIGII";
  version: "7.0.0";
  fileId: string;
  createdAt: string;
  originalFilename?: string;
  formatHint?: NSIGIIFormatHint;
  payloadSize: number;
  payloadHash: string;
}

export interface NSIGIIChannel {
  id: 0 | 1 | 2;
  role: NSIGIIChannelRole;
  hash: string;
  state: NSIGIIClassification;
}

export interface NSIGIISegment {
  segmentId: number;
  channelId: 0 | 1 | 2;
  timestampNs: number;
  payloadOffset: number;
  payloadSize: number;
  payloadHash: string;
  rwxFlags: number;
  state: NSIGIIClassification;
}

export interface NSIGIIVerification {
  segmentId: number;
  transmitHash: string;
  receiveHash: string;
  verifyHash: string;
  consensus: NSIGIIConsensusState;
  consensusScore: number;
  humanRightsTag: NSIGIIHumanRightsTag;
}

export interface NSIGIIFooter {
  segmentCount: number;
  finalHash: string;
  signature?: string;
}

export interface NSIGIIContainer {
  header: NSIGIIHeader;
  channels: NSIGIIChannel[];
  segments: NSIGIISegment[];
  verification: NSIGIIVerification;
  footer: NSIGIIFooter;
  payload: Buffer;
}

export interface NSIGIIWrapOptions {
  originalFilename?: string;
  formatHint?: NSIGIIFormatHint;
  fileId?: string;
  outputPath?: string;
}

export interface NSIGIIVerifyResult {
  consensus: NSIGIIConsensusState;
  classification: NSIGIIClassification;
  payloadHashMatch: boolean;
  channelHashMatch: boolean;
  finalHashMatch: boolean;
  rwxChainValid: boolean;
  /** Independent TRANSMIT, RECEIVE and VERIFY readings. YES requires 3/3. */
  tridentChecks: readonly [boolean, boolean, boolean];
  consensusCount: number;
}
