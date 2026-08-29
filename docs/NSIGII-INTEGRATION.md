# NSIGII integration architecture

How the three NSIGII repositories compose into one layered system **without**
merging their wire formats or duplicating their implementations.

> `container mechanics` ≠ `constitutional verification` ≠ `application interpretation`
>
> Transport, verification, and interpretation are three responsibilities owned by
> three repositories. This document defines the seams between them.

---

## 1. The three layers

```
                          NSIGII ecosystem

              ┌─────────────────────────────────┐
              │ obinexusmk2/nsigii              │
              │ Constitutional runtime          │
              │ TypeScript / Node               │
              │                                 │
              │ wrap · verify · inspect         │
              │ extract · link · topology       │
              └───────────────┬─────────────────┘
                              │ arbitrary payload
                              ▼
              ┌─────────────────────────────────┐
              │ obinexus/nsigii_project         │
              │ C11 byte‑container core         │
              │                                 │
              │ NSIGII01:  bytes → container    │
              │            → original bytes     │
              │                                 │
              │ C · Python · Go · Lua           │
              │ Node N‑API · WASM               │
              └───────────────┬─────────────────┘
                              │ application payload
                              ▼
              ┌─────────────────────────────────┐
              │ obinexus/nsigii_viewer          │
              │ NSIGII Scope — app renderer     │
              │                                 │
              │ legacy 7.0.0  video (I420)      │
              │ legacy 7.1.0A coloured ASCII    │
              └─────────────────────────────────┘
```

Each box is an independent source of truth. Arrows are **data**, not code
dependencies: a wrapper *may* carry a `CORE_V1` object; a `CORE_V1` container
*may* carry a legacy stream. None of this is required (see [§5](#5-nesting-is-optional)).

---

## 2. The three wire formats

They share the ASCII prefix `NSIGII` and the `.nsigii` extension. **That is all
they share.** Different headers, different footers, different integrity models,
different owners.

### 2.1 `CORE_V1` — generic C11 byte container

| | |
|---|---|
| Repo / spec | `obinexus/nsigii_project` → `FORMAT.md` (authoritative) |
| Magic | `NSIGII01` (8 ASCII bytes) |
| Integers | unsigned little‑endian |
| Header | 32 bytes: magic(8) · `header_size`=32(4) · `flags`=0x00000003 `chunked\|crc32`(4) · `declared_size`=`UINT64_MAX`(8) · `version_major`=1(4) · `version_minor`=0(4) |
| Payload | repeated `[u32 chunk_length][chunk_length bytes]`; a zero `chunk_length` terminates. Reference encoder emits ≤ 64 KiB chunks; a conforming decoder accepts ≤ 16 MiB and rejects larger. |
| Footer | 16 bytes: decoded size `u64`(8) · IEEE CRC‑32 of decoded payload(4) · `END1`(4) |
| Invariant | `decode(encode(bytes)) == bytes` for **every** finite byte sequence, including empty input and input containing NUL bytes |
| Character | format‑agnostic, streaming, allocation‑free C core, stable plain‑C ABI, WASM build |

It carries **bytes**. It does not know or store filenames, dimensions,
timestamps, hashes-as-metadata, or any application semantics. This is the
transport layer.

**Do not** add filenames, video dimensions, donut knowledge, trident consensus,
timestamps, SHA metadata, application semantics, or JavaScript‑specific
behaviour to `src/nsigii.c`. Any change to the wire format is an explicit
versioning discussion and a `FORMAT.md` amendment.

### 2.2 `CONSTITUTIONAL_WRAPPER` — verification envelope

| | |
|---|---|
| Repo / spec | `obinexusmk2/nsigii` → this repo's `README.md`, `docs/NSIGII-SPEC.md` |
| Magic | `NSIGII\0` (7 bytes) followed by `version_major` = `0x07` at byte 7 |
| Header | 369 bytes for v7.0.0; `header_size` + `channel_table_offset` / `segment_table_offset` / `payload_offset` locate every block, so readers never assume fixed sizes. Carries `payload_hash` (SHA‑256 hex), `file_id`, `created_at`, `original_filename`, `format_hint`. |
| Body | channel table (trident: TRANSMIT / RECEIVE / VERIFY) · segment table (RWX chain `WRITE → READ → EXECUTE`) · verification block (trident hashes + consensus verdict) · payload (raw, unmodified) |
| Footer | `ENDNSIGII` (9 ASCII bytes) · `segment_count` `u64` · `final_hash` (SHA‑256 hex) · `signature` (reserved, zero‑filled). Pre‑0.1 `ENDSIGII` (8 bytes) accepted on read. |
| Integrity | `verify` recomputes the payload hash, the channel‑table hash and the final hash, checks the RWX chain, and requires **3/3** independent trident agreement for a `YES`. `extract` is refused below `YES`. |
| Consensus | `YES` (0xFF) · `NO` (0x00) · `MAYBE` (0x10); classification `SIGNAL` / `NOSIGNAL` / `NOISE` / `NONOISE` |

It carries **a verified payload plus a receipt**. That payload is frequently a
`CORE_V1` object, but may be anything. This is the verification layer.

**It must not become the C byte‑container implementation.** It wraps a payload;
it does not frame or checksum bytes the way `CORE_V1` does.

### 2.3 `LEGACY_CODEC_STREAM` — media / state application format

| | |
|---|---|
| Repo / spec | `obinexus/nsigii_viewer` → `FORMAT-LEGACY.md` (to be added in this repo's viewer; today: `README.md` + `examples/README.md` prose) |
| Magic | `NSIGII\0\0` (8 bytes — byte 6 and byte 7 both `0x00`) |
| Versions | `7.0.0` → I420 video timeline · `7.1.0A` → coloured‑ASCII rotation state‑space (trailing `A`) |
| Header | 32 bytes: magic(8) · `version`(8, NUL‑padded) · `width` `u32` · `height` `u32` · `framecount` `u32` (patched post‑encode; `0` means the encoder was interrupted — do not trust it) · `reserved` `u32` (ASCII kind packs the rotation grid as `(grid_a << 16) \| grid_b`) |
| Frames | repeating `[u32 size][size bytes]`; a `size` of `0` is skipped. Frame bytes are **raw DEFLATE** (RFC 1951, no zlib wrapper → `wbits = -15`). |
| `7.1.0A` frame | four planar byte planes — `char \| red \| green \| blue`, each `width*height` bytes. Frame index for the grid is `a_index * grid_b + b_index`. |

It carries **an application artifact whose interactivity is baked in as state**,
not script. This is the interpretation layer. It is **not** the generic C
container and its frames are never a nested NSIGII artifact.

Backward compatibility is preserved: every existing `7.0.0` / `7.1.0A` file keeps
opening in the viewer exactly as before.

---

## 3. Ownership boundaries

| Concern | **Owner** | Never owned by |
|---|---|---|
| `CORE_V1` wire format, `FORMAT.md`, C codec, C ABI, all language bindings, `make wasm` artifacts | `nsigii_project` | main, viewer |
| Browser WASM **adapter** around the C exports (`decode()` / `encode()`), shipped next to the `.wasm` | `nsigii_project` (`bindings/web/`) | main |
| Constitutional wrapper format, trident, SHA‑256, consensus, `wrap` / `verify` / `inspect` / `extract` / `link` / `topology` | `nsigii` (main) | project, viewer |
| Browser‑safe constitutional `verify` / `extract` for the viewer | `nsigii` (main), as a published build | viewer re‑implementing it |
| Legacy codec stream parsing, rendering, the donut fixture, terminal player, Go / Python bakers | `nsigii_viewer` | project; main may *depend on* it, not re‑fork it |
| Authoritative legacy format spec (`FORMAT-LEGACY.md`) | `nsigii_viewer` | — |
| The format‑dispatch contract text (`docs/DISPATCH.md`) | `nsigii` (main) owns the text; each repo implements its **own** copy | — |
| End‑to‑end demo scripts, integration CI, this document | `nsigii` (main), as orchestrator | — |

Consequences:

- The main repo may orchestrate integration scripts and tests but **does not own
  a copy** of the C implementation or the viewer implementation.
- `src/core/codec.ts` in this repo is an **inspection convenience** for the
  legacy header (metadata + frame‑table walk, no rendering). It is not
  authoritative — `nsigii_viewer/FORMAT-LEGACY.md` is.
- No language binding (Python, Go, Lua, Node, browser JS) is authoritative for
  the `CORE_V1` wire format. The C source is. JavaScript does not
  independently re‑implement `CORE_V1` when the C/WASM build is available.

---

## 4. Format detection

The shared decision procedure is specified in [`docs/DISPATCH.md`](DISPATCH.md).
Summary:

```
first 8 bytes == "NSIGII01"                     -> CORE_V1
"NSIGII" prefix, byte[6]=0x00, byte[7]=0x07     -> CONSTITUTIONAL_WRAPPER
first 8 bytes == "NSIGII\0\0"                   -> LEGACY_CODEC_STREAM
otherwise                                        -> UNKNOWN
```

Each repository implements this itself, from the contract text — no repo imports
another repo's dispatcher. This repo's implementation will live at
`src/format/dispatch.ts` and be surfaced as `nsigii dispatch <file>` (Phase 4;
not yet present).

`UNKNOWN` is inert: metadata and save only, never decode / render / execute.

---

## 5. Nesting is optional

An arbitrary file does **not** need to be media or interactive to use `CORE_V1`.
The common case is flat:

```
raw bytes ──▶ CORE_V1 pack ──▶ .nsigii ──▶ CORE_V1 decode ──▶ identical raw bytes
```

Layers compose only when you ask them to. The full stack, when every layer is
used, is:

```
        raw / application bytes
                │
                ▼
           NSIGII01 C core            transport: frame + CRC‑32
                │
                ▼
      optional constitutional         verification: SHA‑256 + trident 3/3
       verification wrapper
                │
                ▼
        verifier / extractor          gate: no YES → no extract
                │
                ▼
         C / WASM decoder             transport: CRC‑32 checked
                │
                ▼
        application payload
                │
                ▼
             viewer                   interpretation: render if understood
```

Unwrapping is **bounded to 4 dispatch hops**, with cycle and malformed‑bounds
detection. `LEGACY_CODEC_STREAM` and `UNKNOWN` are always leaves.

---

## 6. Security model

| Rule | Meaning |
|---|---|
| A `.nsigii` artifact is data | Detecting, decoding, verifying, or extracting never runs it. |
| No automatic execution of extracted payloads | Not in the CLI, not in the SDK, not in the browser. Ever. |
| `EXECUTE` is a verification stage | The RWX / trident `EXECUTE` step is the `VERIFY` channel brokering consensus. It is **not** "launch the extracted program". |
| Verification ≠ interpretation | Different components. A passed verify gate does not authorise execution or rendering. |
| Understood formats only | A renderer displays a kind it explicitly implements. `UNKNOWN` stays inert bytes with a download option. |
| Bounded, cycle‑safe unwrapping | Depth cap of 4; malformed or cyclic chains stop with an operator‑visible error. |
| No implicit trust of nested content | Each hop re‑applies its own integrity gate. A valid outer wrapper proves nothing about its payload. |

---

## 7. Verification order

The sequence is fixed. Verify **before** trust or interpretation.

**Constitutional wrapper:**

```
detect = CONSTITUTIONAL_WRAPPER
  → parse header (bounds‑checked offsets)
  → recompute payload hash, channel‑table hash, final hash
  → check RWX chain WRITE → READ → EXECUTE
  → require 3/3 trident consensus  ── fail ─▶ stop, no extract
  → extract payload to original_filename
  → re‑detect on the extracted bytes (next hop, depth+1)
```

**Core container:**

```
detect = CORE_V1
  → C / WASM decode, streaming
  → footer CRC‑32 must equal the reconstructed payload's CRC  ── fail ─▶ stop
  → re‑detect on the decoded bytes (next hop, depth+1)
```

**Legacy stream:**

```
detect = LEGACY_CODEC_STREAM
  → structural parse: 32‑byte header + walk DEFLATE frame table
  → hand to the viewer's existing renderer   (leaf — no re‑detect)
```

**Unknown:**

```
detect = UNKNOWN
  → show size + preview, offer save     (leaf — never decode / render / execute)
```

---

## 8. Browser architecture

The viewer (`obinexus/nsigii_viewer`) gains a dispatch front end. The existing
"NSIGII Scope" interface and the legacy renderer are **preserved**; the donut
renderer is not rewritten.

```
load bytes (drop / Open / ?src=)
        │
        ▼
   detect kind  (viewer's own copy of the contract)
        │
        ├─ CORE_V1
        │     → decode with the C/WASM adapter from nsigii_project
        │       (bindings/web/nsigii.js + nsigii.wasm, via a thin adapter)
        │     → re‑dispatch the decoded bytes (bounded)
        │
        ├─ CONSTITUTIONAL_WRAPPER
        │     → verify + extract with a browser‑compatible adapter
        │       from the main nsigii project
        │     → re‑dispatch the payload (bounded)
        │     → if no browser verifier is present: show the receipt, stop
        │
        ├─ LEGACY_CODEC_STREAM
        │     → existing NSIGII Scope rendering path, unchanged
        │
        └─ UNKNOWN
              → metadata + download; never executed
```

Constraints:

- The browser uses the **C/WASM exports** for `CORE_V1` decoding. It does not
  re‑implement `CORE_V1` parsing in hand‑written JavaScript. The adapter is a
  small wrapper around `NsigiiModule()` (`_nsigii_encoded_bound`,
  `_nsigii_encode_buffer`, `_nsigii_decode_buffer`, `_malloc`, `_free`, `cwrap`).
- `nsigii.js` / `nsigii.wasm` are produced by `make wasm` in `nsigii_project`.
  They are build outputs — not vendored into the viewer, not committed.
- The legacy path still opens an **original, unwrapped** `donut.nsigii`
  directly, with no adapter in the way.

---

## 9. Native architecture

```
                 nsigii (Node CLI / SDK)
                 wrap · inspect · verify · extract · link · topology
                 dispatch (Phase 4)                     run / view — verify only
                        │
       ┌────────────────┴───────────────┐
       │ CONSTITUTIONAL_WRAPPER          │ CORE_V1 payload
       │ handled in‑repo (TypeScript)    │ delegated, never re‑implemented
       ▼                                 ▼
   trident verify / extract        C core: native lib · CLI · N‑API · WASM
   (this repo)                     (obinexus/nsigii_project)
```

- The CLI locates the C core through an explicit path / environment variable
  (`NSIGII_C_REPO`, or a resolved `nsigii` binary), or a WASM module. It does
  not assume a sibling filesystem layout and creates no hidden dependency on
  `../nsigii_project`.
- CI checks out all three repositories at pinned revisions and proves
  interoperability there, rather than relying on developer‑machine state.

---

## 10. Compatibility policy

| Layer | Policy |
|---|---|
| `CORE_V1` wire format | Frozen at v1. Any change requires an explicit versioning discussion and a `FORMAT.md` amendment. `FORMAT.md` stays authoritative. |
| Constitutional wrapper | `ENDNSIGII` footer is current; `ENDSIGII` is read for pre‑0.1 files. Header growth is via `header_size` + offset pointers, never by assuming fixed table sizes. |
| Legacy codec stream | `7.0.0` and `7.1.0A` remain readable unchanged. New capability rides unused fields (the `A` suffix, the `reserved` grid) so old readers stop cleanly and new readers branch. Existing fixtures and drag / state‑grid behaviour are preserved. |
| Dispatch table | Amended only by editing `docs/DISPATCH.md`. Magic values are never changed to make dispatch convenient. A new kind is a new `byte[7]` value or a new 8‑byte literal, added explicitly. |
| No fourth format | Integration does not invent a new `.nsigii` layout. An old file is never silently reinterpreted as a new one. |

---

## 11. Test matrix

Full definitions in the integration test suite (Phase 6). Boundaries covered:

| ID | Path | Asserts |
|---|---|---|
| A | raw → C encode → C decode | byte‑for‑byte equal (cmp + SHA‑256) |
| B | raw → C encode → wrap → verify → extract → C decode | byte‑for‑byte equal |
| C | legacy donut → C encode → C decode | exact legacy donut bytes |
| D | legacy donut → C encode → wrap → verify → extract → C decode | exact legacy donut bytes |
| E | viewer opens original legacy donut | renders (frame count, non‑empty scope) |
| F | viewer opens `CORE_V1`‑wrapped legacy donut | renders identically via the WASM adapter |
| G | viewer opens wrapper → `CORE_V1` → legacy donut | browser Web-Crypto verify (3/3) → extract → WASM decode → renders identically |
| H | corrupt `CORE_V1` CRC‑32 | decode fails |
| I | corrupt constitutional hash | verify fails; extract refused |
| J | unknown arbitrary payload | classified `UNKNOWN`; never executed; CLI refuses; viewer offers download only |
| K | empty payload; embedded NUL bytes | survive every applicable round trip |

Plus: all pre‑existing tests of each repo continue to pass; `make wasm` succeeds;
the Python / Go / Lua / Node bindings still pass; working trees are clean after
the run. Fixtures are small enough for CI — the 1.3 MB donut is exercised from a
CI checkout of the viewer repo, not committed here.

---

## 12. Migration path

Documentation‑first, additive, one focused change at a time. No cross‑repo
rewrite in a single commit; no force‑push; no history rewrite.

| Phase | Repo | Change | Risk |
|---|---|---|---|
| 1 | main | this document, `docs/DISPATCH.md`, README "three layers" section | docs only |
| 2 | `nsigii_project` | `bindings/web` WASM adapter + `README` note + CI (`make && make test && make wasm`) | additive; `FORMAT.md` / `nsigii.c` untouched |
| 3 | `nsigii_viewer` | `FORMAT-LEGACY.md` | docs only |
| 4 | main | `src/format/dispatch.ts` (4‑way), rewire `variant.ts`, `nsigii dispatch`, fixtures | pure byte inspection |
| 5 | main | `CORE_V1` decode via the C core; bounded nested dispatch (`unwrap`) | delegated decode; depth cap |
| 6 | main | cross‑repo integration tests A–K; multi‑repo CI | proves interop in CI |
| 7 | `nsigii_viewer` | route `CORE_V1` through the WASM adapter before the legacy parser; correct `@obinexusltd/nsigii` → `nsigii` strings | legacy renderer untouched |
| 8 | main + `nsigii_viewer` | browser constitutional `verify` / `extract` (`src/browser/constitutional.mts` → `dist/browser/constitutional.mjs`, Web Crypto); viewer verifies 3/3 then descends. Parity-tested against `src/core/verify.ts`. |

**Definition of done:** all original tests pass; `CORE_V1` native + binding
tests pass; WASM build succeeds; wrapper tests pass; the legacy viewer still
opens original fixtures; the cross‑repo raw‑byte round trip passes; a wrapped
legacy donut reaches the existing renderer through the new adapter path; the
three formats are clearly documented as distinct; no implementation is
duplicated as a second source of truth; no arbitrary‑payload execution has been
introduced; git working trees are clean after tests.

---

## 13. Invariants (do not trade these away for a simpler integration)

- **`CORE_V1`:** `decode(encode(bytes)) == bytes`.
- **Constitutional layer:** verify before trust or interpretation.
- **Viewer:** interpretation is application behaviour, not container behaviour.
