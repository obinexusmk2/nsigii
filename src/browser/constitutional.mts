/**
 * Browser-safe constitutional wrapper verify / extract.
 *
 * A portable mirror of src/core/inspect.ts + verify.ts + extract.ts using only
 * web-standard APIs (Uint8Array, DataView, TextDecoder, crypto.subtle) so it
 * runs unchanged in a browser and in Node >= 18. The Node modules under
 * src/core/ stay authoritative; test/browser-parity.test.ts asserts this file
 * produces the identical verdict and payload for every wrapped fixture, so the
 * two cannot drift.
 *
 * Layout (little-endian) — see this repo's README "NSIGII File Format":
 *   header 369 B: magic(7) maj@7 min@8 patch@9 fmt@10 endian@11 header_size u32@12
 *     payload_size u64@16 channel_count@24 channel_table_offset u64@25
 *     segment_table_offset u64@33 payload_offset u64@41 payload_hash hex64@49
 *     file_id@113 created_at@177 original_filename@209 format_hint@337
 *   channel entry: id(1) roleLen(1) role(roleLen) hash hex64 state(1)
 *   segment entry (101 B): segmentId u64 channelId(1) timestampNs u64
 *     payloadOffset u64 payloadSize u64 payloadHash hex64 rwx(1) state(1) pad(2)
 *   verification (213 B): segmentId u64 transmitHash receiveHash verifyHash (hex64 x3)
 *     consensus(1) consensusScore f32 hrTag(1) pad(7)
 *   footer: "ENDNSIGII" (or legacy "ENDSIGII") segment_count u64 final_hash hex64 signature(64)
 */

const HASH_HEX = 64;
const SEGMENT_ENTRY_SIZE = 101;
const TRIDENT = 3;
const FOOTER_MAGIC = "ENDNSIGII";
const FOOTER_MAGIC_LEGACY = "ENDSIGII";
const CLASS = ["NOISE", "NONOISE", "SIGNAL", "NOSIGNAL"] as const;
const CONSENSUS: Record<number, "YES" | "NO" | "MAYBE"> = { 0xff: "YES", 0x00: "NO", 0x10: "MAYBE" };

const dec = new TextDecoder("latin1");
const asciiTrim = (b: Uint8Array, off: number, len: number) =>
  dec.decode(b.subarray(off, off + len)).replace(/\0+$/g, "").replace(/\0/g, "");

async function sha256Hex(b: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", b));
  let s = "";
  for (const x of d) s += x.toString(16).padStart(2, "0");
  return s;
}
async function sha256Raw(b: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", b));
}

const toU8 = (x: ArrayBuffer | Uint8Array): Uint8Array =>
  x instanceof Uint8Array ? x : new Uint8Array(x);

function u64(dv: DataView, off: number): number {
  const v = dv.getBigUint64(off, true);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`NSIGII offset too large at ${off}`);
  return Number(v);
}

export interface ConstitutionalInfo {
  version: string;
  originalFilename?: string;
  formatHint: string;
  payloadOffset: number;
  payloadSize: number;
  payloadHash: string;
  channelTableOffset: number;
  segmentTableOffset: number;
  channels: { id: number; role: string; hash: string; state: string }[];
  segments: { segmentId: number; channelId: number; payloadOffset: number; payloadSize: number; payloadHash: string; rwxFlags: number; state: string }[];
  verification: { segmentId: number; transmitHash: string; receiveHash: string; verifyHash: string; consensus: "YES" | "NO" | "MAYBE"; consensusScore: number };
  footer: { finalHash: string };
}

export interface ConstitutionalVerifyResult {
  consensus: "YES" | "NO" | "MAYBE";
  classification: "SIGNAL" | "NOSIGNAL" | "NOISE" | "NONOISE";
  payloadHashMatch: boolean;
  channelHashMatch: boolean;
  finalHashMatch: boolean;
  rwxChainValid: boolean;
  tridentChecks: [boolean, boolean, boolean];
  consensusCount: number;
}

/** Parse the wrapper structure. Throws on a bad magic or out-of-bounds offsets. */
export function inspectBytes(input: ArrayBuffer | Uint8Array): ConstitutionalInfo {
  const b = toU8(input);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (asciiTrim(b, 0, 6) !== "NSIGII" || b[6] !== 0x00) throw new Error("Not a constitutional wrapper");

  let footerPos = lastIndexOf(b, FOOTER_MAGIC);
  let footerLen = FOOTER_MAGIC.length;
  if (footerPos < 0) { footerPos = lastIndexOf(b, FOOTER_MAGIC_LEGACY); footerLen = FOOTER_MAGIC_LEGACY.length; }
  if (footerPos < 0) throw new Error("NSIGII footer not found");

  const version = `${b[7]}.${b[8]}.${b[9]}`;
  const payloadSize = u64(dv, 16);
  const channelTableOffset = u64(dv, 25);
  const segmentTableOffset = u64(dv, 33);
  const payloadOffset = u64(dv, 41);
  const payloadHash = asciiTrim(b, 49, HASH_HEX);
  const originalFilename = asciiTrim(b, 209, 128) || undefined;
  const formatHint = asciiTrim(b, 337, 32);

  for (const [n, o] of [["channelTableOffset", channelTableOffset], ["segmentTableOffset", segmentTableOffset], ["payloadOffset", payloadOffset]] as const) {
    if (!Number.isSafeInteger(o) || o < 0 || o >= b.length) throw new Error(`Invalid NSIGII ${n}: ${o}`);
  }
  if (payloadOffset + payloadSize > b.length) throw new Error("Invalid NSIGII payload bounds");

  let off = channelTableOffset;
  const channelCount = b[24];
  const channels = [];
  for (let i = 0; i < channelCount; i++) {
    const id = b[off++];
    const roleLen = b[off++];
    const role = asciiTrim(b, off, roleLen); off += roleLen;
    const hash = asciiTrim(b, off, HASH_HEX); off += HASH_HEX;
    const state = CLASS[b[off++]] ?? "NOISE";
    channels.push({ id, role, hash, state });
  }

  off = segmentTableOffset;
  const segments = [];
  for (let i = 0; i < TRIDENT; i++) {
    const segmentId = u64(dv, off); off += 8;
    const channelId = b[off++];
    off += 8; // timestampNs
    const segPayloadOffset = u64(dv, off); off += 8;
    const segPayloadSize = u64(dv, off); off += 8;
    const segPayloadHash = asciiTrim(b, off, HASH_HEX); off += HASH_HEX;
    const rwxFlags = b[off++];
    const state = CLASS[b[off++]] ?? "NOISE";
    off += 2;
    segments.push({ segmentId, channelId, payloadOffset: segPayloadOffset, payloadSize: segPayloadSize, payloadHash: segPayloadHash, rwxFlags, state });
  }

  off = segmentTableOffset + TRIDENT * SEGMENT_ENTRY_SIZE;
  const vSegmentId = u64(dv, off); off += 8;
  const transmitHash = asciiTrim(b, off, HASH_HEX); off += HASH_HEX;
  const receiveHash = asciiTrim(b, off, HASH_HEX); off += HASH_HEX;
  const verifyHash = asciiTrim(b, off, HASH_HEX); off += HASH_HEX;
  const consensus = CONSENSUS[b[off++]] ?? "MAYBE";
  const consensusScore = dv.getFloat32(off, true); off += 4;

  off = footerPos + footerLen;
  off += 8; // segment_count
  const finalHash = asciiTrim(b, off, HASH_HEX);

  return {
    version, originalFilename, formatHint, payloadOffset, payloadSize, payloadHash,
    channelTableOffset, segmentTableOffset, channels, segments,
    verification: { segmentId: vSegmentId, transmitHash, receiveHash, verifyHash, consensus, consensusScore },
    footer: { finalHash },
  };
}

/** Recompute every hash and the trident consensus. Mirrors src/core/verify.ts. */
export async function verifyBytes(input: ArrayBuffer | Uint8Array): Promise<ConstitutionalVerifyResult> {
  const b = toU8(input);
  const info = inspectBytes(b);
  const payload = b.subarray(info.payloadOffset, info.payloadOffset + info.payloadSize);
  const recomputedPayloadHash = await sha256Hex(payload);
  const payloadHashMatch = recomputedPayloadHash === info.payloadHash;

  const channelsBuf = b.subarray(info.channelTableOffset, info.segmentTableOffset);
  const recomputedChannelHash = await sha256Raw(channelsBuf);
  const roles = ["TRANSMIT", "RECEIVE", "VERIFY"] as const;
  const vHashes = [info.verification.transmitHash, info.verification.receiveHash, info.verification.verifyHash];
  const tridentChecks = roles.map((role, i) => {
    const ch = info.channels[i];
    const sg = info.segments[i];
    return ch?.id === i && ch.role === role && ch.hash === recomputedPayloadHash && ch.state === "SIGNAL"
      && sg?.segmentId === i && sg.channelId === i && sg.payloadHash === recomputedPayloadHash
      && sg.payloadOffset === info.payloadOffset && sg.payloadSize === info.payloadSize && sg.state === "SIGNAL"
      && vHashes[i] === recomputedPayloadHash;
  }) as [boolean, boolean, boolean];
  const consensusCount = tridentChecks.filter(Boolean).length;
  const channelHashMatch = consensusCount === 3;

  const merged = new Uint8Array(payload.length + recomputedChannelHash.length);
  merged.set(payload, 0);
  merged.set(recomputedChannelHash, payload.length);
  const finalHashMatch = (await sha256Hex(merged)) === info.footer.finalHash;

  const rwx = [0b010, 0b100, 0b001];
  const rwxChainValid = info.segments.length === 3 && info.segments.every((s, i) => s.rwxFlags === rwx[i]);
  const storedConsensusValid = info.verification.consensus === "YES" && info.verification.consensusScore === 1 && info.verification.segmentId === 2;

  let consensus: "YES" | "NO" | "MAYBE" = "MAYBE";
  let classification: ConstitutionalVerifyResult["classification"] = "NOISE";
  if (payloadHashMatch && channelHashMatch && finalHashMatch && rwxChainValid && storedConsensusValid) {
    consensus = "YES"; classification = "SIGNAL";
  } else if (!payloadHashMatch && !finalHashMatch) {
    consensus = "NO"; classification = "NOISE";
  } else {
    consensus = "MAYBE"; classification = "NOSIGNAL";
  }
  return { consensus, classification, payloadHashMatch, channelHashMatch, finalHashMatch, rwxChainValid, tridentChecks, consensusCount };
}

export interface ConstitutionalExtract {
  bytes: Uint8Array;
  originalFilename?: string;
  consensus: "YES" | "NO" | "MAYBE";
}

/** Verify, then return the payload — throws unless consensus is YES. */
export async function extractBytes(input: ArrayBuffer | Uint8Array): Promise<ConstitutionalExtract> {
  const b = toU8(input);
  const result = await verifyBytes(b);
  if (result.consensus !== "YES") {
    throw new Error(`NSIGII container did not reach required 3/3 verification consensus (${result.consensusCount}/3) — extraction blocked`);
  }
  const info = inspectBytes(b);
  return {
    bytes: b.slice(info.payloadOffset, info.payloadOffset + info.payloadSize),
    originalFilename: info.originalFilename,
    consensus: result.consensus,
  };
}

function lastIndexOf(hay: Uint8Array, needle: string): number {
  const n = needle.length;
  for (let i = hay.length - n; i >= 0; i--) {
    let ok = true;
    for (let j = 0; j < n; j++) if (hay[i + j] !== needle.charCodeAt(j)) { ok = false; break; }
    if (ok) return i;
  }
  return -1;
}
