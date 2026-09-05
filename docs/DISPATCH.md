# NSIGII format‑dispatch contract

**Status:** normative for the NSIGII ecosystem. Canonical copy lives in
`obinexusmk2/nsigii`. Each repository implements this decision **independently**
from this text — no repository imports another's dispatcher.

Three unrelated binary layouts share the ASCII prefix `NSIGII` and, by
convention, the `.nsigii` file extension. They are **not** the same format and
must never be collapsed into one. This document defines how any reader decides
which of the three (or none) it is holding, and the rules for acting on that
decision.

---

## 1. The four kinds

| Kind | Owner repo | First 8 bytes (hex) | First 8 bytes (ASCII) |
|---|---|---|---|
| `CORE_V1` | `obinexus/nsigii_project` | `4E 53 49 47 49 49 30 31` | `NSIGII01` |
| `CONSTITUTIONAL_WRAPPER` | `obinexusmk2/nsigii` | `4E 53 49 47 49 49 00 07` | `NSIGII\0` + `0x07` |
| `LEGACY_CODEC_STREAM` | `obinexus/nsigii_viewer` | `4E 53 49 47 49 49 00 00` | `NSIGII\0\0` |
| `UNKNOWN` | — | anything else | — |

The discriminating bytes are **byte 6 and byte 7**:

```
offset 0 1 2 3 4 5   6    7
       N S I G I I   b6   b7
                     30h  31h   -> CORE_V1              ("01")
                     00h  07h   -> CONSTITUTIONAL_WRAPPER (version_major = 7)
                     00h  00h   -> LEGACY_CODEC_STREAM   (magic padding)
```

All three are mutually exclusive. Nothing else is a NSIGII artifact.

---

## 2. Decision procedure

Given the first `min(len, 8)` bytes of a candidate artifact:

```
function detect_nsigii_kind(head):
    if len(head) < 8:                       return UNKNOWN
    if head[0:8] == "NSIGII01":             return CORE_V1
    if head[0:6] != "NSIGII":               return UNKNOWN
    if head[6] == 0x00 and head[7] == 0x07: return CONSTITUTIONAL_WRAPPER
    if head[6] == 0x00 and head[7] == 0x00: return LEGACY_CODEC_STREAM
    return UNKNOWN
```

Rules:

- **Order is fixed.** `CORE_V1` is tested first by full 8‑byte literal; the
  wrapper and legacy arms are only reached for a `NSIGII\0…` prefix.
- **Never guess.** A `NSIGII` prefix with `byte[7]` outside `{0x00, 0x07}` is
  `UNKNOWN`, not "probably a wrapper". Future wrapper majors will extend this
  table by explicit amendment, not by readers assuming.
- **The extension is not evidence.** Decide on bytes only. A `.nsigii` file may
  be `UNKNOWN`; a NSIGII artifact may have any name.
- **Detection is not validation.** A positive kind means "parse it as this
  layout next", not "this artifact is well‑formed". Each layout has its own
  integrity check (CRC‑32 for `CORE_V1`, trident 3/3 consensus for the wrapper,
  structural frame walk for legacy).

---

## 3. What each kind means for a reader

| Kind | Next action | Integrity gate | May contain |
|---|---|---|---|
| `CORE_V1` | decode with the C core (native lib, CLI, or WASM) | IEEE CRC‑32 in the 16‑byte footer must match the reconstructed payload | arbitrary bytes — possibly another NSIGII artifact |
| `CONSTITUTIONAL_WRAPPER` | `verify`, then `extract` | 3/3 trident consensus (`YES`) — extraction is refused otherwise | arbitrary bytes — commonly a `CORE_V1` object |
| `LEGACY_CODEC_STREAM` | hand to the viewer's existing renderer | structural: 32‑byte header + walkable DEFLATE frame table | I420 video (`7.0.0`) or coloured‑ASCII rotation state (`7.1.0A`) — never nested NSIGII |
| `UNKNOWN` | present metadata; offer save / inspect | none | opaque bytes |

**`UNKNOWN` is inert.** It is never decoded, never rendered, never executed.
The only permitted actions are: report size and a hex/format preview, and let
the operator save the bytes.

---

## 4. Nesting

Some artifacts contain another NSIGII artifact as their payload. Readers that
support this re‑run the decision procedure on the bytes produced by the previous
step:

```
CONSTITUTIONAL_WRAPPER
    │  verify (3/3)  →  extract
    ▼
CORE_V1
    │  C / WASM decode  (CRC‑32 checked)
    ▼
LEGACY_CODEC_STREAM
    │  existing viewer renderer
    ▼
rendered output
```

`CORE_V1` decoding a plain payload is the common, non‑nested case:

```
CORE_V1
    │  decode
    ▼
arbitrary bytes  →  save / inspect as a generic payload
```

Nesting rules:

1. **Nesting is optional.** An arbitrary file does not need to be media,
   interactive, or a wrapper to be carried in `CORE_V1`. Most `CORE_V1`
   payloads are just bytes.
2. **Bounded depth.** Unwrapping stops after **4** dispatch hops. Reaching the
   limit is an error surfaced to the operator, not a silent truncation.
3. **Cycle / malformed detection.** If a step yields bytes whose length is `0`,
   whose declared bounds fall outside the buffer, or which re‑detect as a kind
   already seen on this chain, stop and report. Do not loop.
4. **`LEGACY_CODEC_STREAM` is a leaf.** Its frames are DEFLATE‑compressed media
   planes, never a nested NSIGII artifact. Do not re‑dispatch legacy frame
   bytes.
5. **`UNKNOWN` is a leaf.** Stop; never re‑dispatch.
6. **Verify before descend.** For a `CONSTITUTIONAL_WRAPPER`, consensus must
   reach `YES` *before* its payload is extracted and re‑dispatched. A wrapper
   that does not verify ends the chain.

---

## 5. Security invariants

These hold at every hop, in every implementation:

- **An artifact is data.** Detecting or decoding a kind never runs it.
- **`EXECUTE` is a verification stage, not a process launch.** The constitutional
  RWX / trident model's third stage (`VERIFY` channel brokering consensus) must
  never be implemented as "run the extracted payload".
- **Verification ≠ interpretation.** A reader verifies with one component and
  interprets with another. Passing a verify gate does not authorise execution.
- **Understood formats only.** A renderer displays a kind it explicitly
  implements. Everything else is `UNKNOWN` and stays inert.
- **No implicit trust of nested content.** Each hop re‑applies its own integrity
  gate; a valid outer wrapper says nothing about the validity of what it holds.

---

## 6. Conformance notes

- A reader that only handles a subset of kinds MUST still classify the others
  correctly and refuse them cleanly (e.g. the viewer recognises `CORE_V1` and
  routes it to the WASM decoder; a native CLI that only does wrappers reports
  "this is a CORE_V1 container, decode it with the C core").
- Truncated input (`< 8` bytes, or shorter than the detected layout's fixed
  header) is `UNKNOWN` / malformed, never a partial success.
- Implementations SHOULD expose the detected kind and the full nesting chain to
  the operator (`nsigii dispatch <file>` in this repo's CLI) without performing
  any side effect.

---

## 7. Reference points

| Layer | Authoritative spec |
|---|---|
| `CORE_V1` wire format | `obinexus/nsigii_project` → `FORMAT.md` |
| Constitutional wrapper | `obinexusmk2/nsigii` → `README.md` + `docs/NSIGII-SPEC.md` |
| Legacy codec stream | `obinexus/nsigii_viewer` → `FORMAT-LEGACY.md` |
| How the layers relate | `obinexusmk2/nsigii` → `docs/NSIGII-INTEGRATION.md` |
