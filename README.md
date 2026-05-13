# @obinexusltd/nsigii

> **NSIGII — Linkable-Then-Executable Constitutional Verification Container Runtime**
>
> OBINexus Constitutional Computing Framework

---

## Installation
![NSIGII V7](image.png)

### Global (recommended)

```bash
npm install -g @obinexusltd/nsigii
```

Verify:

```bash
nsigii --help
```

### Local Development

```bash
git clone https://github.com/obinexusmk2/nsigii
cd nsigii
npm install
npm run build
npm link
nsigii --help
```

---

## Quick Start

```bash
# Create a sample file
echo "hello world" > hello.txt

# Wrap it into a NSIGII container
nsigii wrap hello.txt

# Inspect the container
nsigii inspect hello.txt.nsigii

# Verify integrity
nsigii verify hello.txt.nsigii

# Extract the payload
nsigii extract hello.txt.nsigii
```

### Expected Output
```
NSIGII v7.0.0
────────────────────────────
File ID:      <uuid>
Created:      2026-05-12T20:20:00.000Z
Original:     hello.txt
Format Hint:  text
Payload Size: 12 bytes
Payload Hash: a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e
Consensus:    YES
Classification: SIGNAL
RWX Chain:    CH0 WRITE → CH1 READ → CH2 EXECUTE
Channels:
  CH0 TRANSMIT (SIGNAL)
  CH1 RECEIVE (SIGNAL)
  CH2 VERIFY (SIGNAL)
Final Hash:   <sha256>
```

---

## CLI Reference

```
NSIGII — Linkable Then Executable Runtime
OBINexus Constitutional Verification System

Usage:
  nsigii <command> [options]

Commands:
  wrap <file>       Wrap file into NSIGII container
  inspect <file>    Inspect NSIGII metadata
  verify <file>     Verify payload integrity
  extract <file>    Extract payload
  link              Resolve linked artifacts
  topology          Inspect trident topology
  run               Execute verified payload
  sign              Sign NSIGII container

Options:
  -v, --version
  -h, --help
```

---

## Architecture

NSIGII is **not** a traditional archive format.

It is a **constitutional verification wrapper** around arbitrary binary payloads.

### Flow

```
raw bytes
    ↓
linked container
    ↓
trinary verification
    ↓
optional execution
```

### Core Principles

1. **Type Container Principle**
   > "The bowl does not care what it holds."
   The container validates geometry and verification first, not semantic type. Payloads are arbitrary bytes.

2. **Trident Channel Model**
   Three constitutional channels form the verification lifecycle:
   - **TRANSMIT** — source intent
   - **RECEIVE** — observed payload
   - **VERIFY** — proof of agreement

3. **RWX Constitutional Chain**
   WRITE → READ → EXECUTE
   Execution never occurs before verification.

4. **Format Agnostic Execution**
   The wrapper never assumes meaning first. It verifies first. Interpretation is optional and secondary.

5. **Filter-Flash Model**
   - **Filter**: pure transformation, no global state mutation
   - **Flash**: commit verified data into storage

6. **Bipartite Electromagnetic Model**
   - Electric = runtime
   - Magnetic = structure
   - EM wave = interoperability

7. **Trinary Consensus**
   - YES / NO / MAYBE
   - SIGNAL / NOSIGNAL / NOISE / NONOISE

8. **Linkable-Then-Executable**
   raw bytes → linked container → verified state → optional execution

---

## NSIGII File Format

### Binary Layout

```
.nsigii file
├── Magic Header        (7 bytes)   "NSIGII\0"
├── Global File Header  (~256 bytes)
├── Channel Table       (3 entries)
├── Segment Table       (3 entries)
├── Verification Block  (117 bytes)
├── Payload Blocks      (raw bytes)
└── Footer / Final Hash (112 bytes)  "ENDSIGII"
```

### Header Fields

| Field | Size | Description |
|-------|------|-------------|
| magic | 7 | `NSIGII\0` |
| version_major | 1 | 7 |
| version_minor | 1 | 0 |
| version_patch | 1 | 0 |
| format_type | 1 | archive, video, audio, text, wasm, binary, mixed |
| endian | 1 | 0 = little |
| header_size | 4 | total header bytes |
| file_size | 8 | total file bytes |
| channel_count | 1 | usually 3 |
| channel_table_offset | 8 | pointer |
| segment_table_offset | 8 | pointer |
| payload_offset | 8 | pointer |
| global_hash | 32 | SHA-256 of canonical body |

### Channels

| ID | Role | RWX |
|----|------|-----|
| 0 | TRANSMIT | WRITE (0b010) |
| 1 | RECEIVE | READ (0b100) |
| 2 | VERIFY | EXECUTE (0b001) |

### States

```
Classification:  NOISE(0x00) | NONOISE(0x01) | SIGNAL(0x02) | NOSIGNAL(0x03)
Consensus:       MAYBE(0x10) | YES(0xFF) | NO(0x00) | TAMPERED(0xEE)
```

---

## SDK API

```typescript
import { wrap, inspect, verify, extract } from "@obinexusltd/nsigii";

// Wrap
const outPath = wrap("document.pdf");

// Inspect
const meta = inspect("document.pdf.nsigii");
console.log(meta.header.payloadHash);

// Verify
const result = verify("document.pdf.nsigii");
// result.consensus → "YES" | "NO" | "MAYBE"

// Extract
const extracted = extract("document.pdf.nsigii");
```

---

## Philosophy

> **Linkable Then Executable**
>
> Physical design first. Technology next.
> When systems fail, build your own.

NSIGII treats every input as raw bytes first, links it, verifies it, and only then optionally interprets it. This is constitutional computing: verification is not an afterthought — it is the foundation.

**Do not** present this as blockchain, crypto hype, or AI hype.

Present it as:
- Protocol engineering
- Verification runtime
- Distributed systems substrate
- Container verification framework

---

## Project Structure

```
nsigii/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── bin/
│   └── nsigii
├── src/
│   ├── index.ts          # Public SDK API
│   ├── cli.ts            # Commander CLI
│   ├── constants.ts      # Binary layout constants
│   ├── types.ts          # TypeScript interfaces
│   ├── format/
│   │   ├── header.ts
│   │   ├── channel.ts
│   │   ├── segment.ts
│   │   ├── verification.ts
│   │   └── footer.ts
│   ├── core/
│   │   ├── wrap.ts
│   │   ├── inspect.ts
│   │   ├── verify.ts
│   │   ├── extract.ts
│   │   └── link.ts
│   ├── utils/
│   │   ├── hash.ts
│   │   ├── bytes.ts
│   │   └── detectFormat.ts
│   ├── protocol/
│   │   ├── constants.ts
│   │   ├── enums.ts
│   │   ├── states.ts
│   │   └── channels.ts
│   ├── verification/
│   │   ├── consensus.ts
│   │   ├── trident.ts
│   │   ├── rwx.ts
│   │   └── signatures.ts
│   ├── linker/
│   │   ├── linker.ts
│   │   ├── resolver.ts
│   │   └── topology.ts
│   ├── runtime/
│   │   └── adapters/
│   │       ├── zip.ts
│   │       ├── wasm.ts
│   │       ├── binary.ts
│   │       ├── text.ts
│   │       └── unknown.ts
│   ├── recovery/
│   │   └── enzyme.ts
│   └── container/
│       ├── reader.ts
│       ├── writer.ts
│       ├── parser.ts
│       └── serializer.ts
├── test/
│   ├── wrap.test.ts
│   ├── inspect.test.ts
│   └── extract.test.ts
└── examples/
    ├── sample.txt
    └── README.md
```

---

## Future Roadmap

- [ ] WASM runtime adapters
- [ ] Rust verification core (native bindings)
- [ ] Distributed relay nodes (trident consensus networking)
- [ ] libpolycall bridge (polyglot runtime)
- [ ] Cloudflare Worker runtime
- [ ] NSIGII streaming containers
- [ ] Ed25519 digital signatures
- [ ] Trinary consensus execution engine
- [ ] Human Rights Verifier v2

---

## License

MIT — OBINexus Computing

---

> *"Don't just boot systems. Boot truthful ones."*
