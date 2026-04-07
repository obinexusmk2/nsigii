# NSIGII

**Nnamdi Sustainable Infrastructure for Global Information Infrastructure**
*A Tripartite Consensus Human Rights Protocol*

> NSIGII is not a weapon. NSIGII is not a toy.
> It is a constitutional human rights protocol for sustainable infrastructure.
> Food, Water, Shelter — delivered free of charge.
> Σ = (N − R) × K — the machine bears suffering, not the person.

---

## What is NSIGII?

NSIGII is a tripartite consensus protocol that verifies and delivers resources across three constitutional channels before any irreversible action (FLASH) is committed. The three channels form a trident — each representing one pole of a magnetic bearing system:

| Channel | Pole | Bearing | Port | Codec | Role |
|---------|------|---------|------|-------|------|
| ch0 | UCHE (Knowledge) | 255° | 8001 | 1×1/3 | Transmitter — encode, ORDER, WRITE |
| ch1 | EZE (Leadership) | 29°  | 8002 | 2×2/3 | Receiver — transit, forward to ch2 |
| ch2 | OBI (Heart/Nexus) | 265° | 8003 | 3×3/3 | Verifier + Broadcaster — consensus, EXECUTE |

Consensus requires all three poles to agree (`0b111 = YES`) before FLASH is committed. This is the **constitutional gate** — no delivery without tripartite consent.

---

## Core Axioms

1. **Filter before Flash** — verification must precede irreversible delivery
2. **Collapse = Received** — a message, once collapsed into the receiver's topology, changes ownership irrevocably (MASMIC axiom)
3. **The machine holds suffering** — Σ = (N − R) × K is carried by the protocol, not the person
4. **RWX chain** — WRITE (ch0) → READ (ch1) → EXECUTE (ch2), in order, no shortcuts

---

## Architecture

### Tripartite Trident

```
  ch0 (UCHE)          ch1 (EZE)           ch2 (OBI)
  Transmitter    -->  Receiver       -->  Verifier + Broadcast
  Knowledge          Leadership           Heart/Nexus
  Bearing 255°       Bearing 29°          Bearing 265°
  Port 8001          Port 8002            Port 8003
  WRITE (0x02)       READ (0x04)          EXECUTE (0x01)
  1 × 1/3            2 × 2/3              3 × 3/3
       |                   |                    |
   ORDER state         CHAOS state        CONSENSUS state
   (encode)           (pair-resolve)     (verify + broadcast)
                                               |
                                    UDP multicast 239.255.42.99:9003
                                    WebSocket    127.0.0.1:8082 → 8080
```

### Packet Lifecycle

```
PENDING → LOADED → FILTER → FLASH → DONE
```

FLASH is irreversible. It only commits when:
- `consensus == 0b111` (YES from all three poles)
- `trident.is_coherent == true`
- `lmac.is_verified == true`
- `sigma == 0` (needs met: N − R = 0)

### Discriminant State Detection

```
Δ = b² − 4ac

Δ > 0  →  ORDER        (asymmetric — two paths)
Δ = 0  →  CONSENSUS    (symmetric — flash point)
Δ < 0  →  CHAOS        (quantum superposition — MAYBE state)
```

### Bipolar Sequence

- **ORDER** (`0x01`) — even sequence tokens, ch0 domain
- **CHAOS** (`0x00`) — odd sequence tokens, ch1 domain
- Consensus resolves ORDER ↔ CHAOS at ch2

---

## MASMIC Magnetic Model

The **MASMIC** (MMUKO — Machine Memory Using Knowledge Operations) model provides the semantic physics layer beneath the network protocol.

```
nsigii.h         — Network protocol layer (channels, packets, RWX, WebSocket)
nsigii_magnetic.h — Semantic physics layer (MMUKO traits, Hooke spring, Bloch sphere, rights)
```

### 6-Step Teleportation: ENCODED → SEALED

| Step | State | Pole | Action |
|------|-------|------|--------|
| 1–2 | ENCODED → ORIENTED | UCHE (ch0) | `nsigii_uche_encode()` — spring force applied |
| 3–4 | SENDING → IN_TRANSIT | EZE (ch1) | `nsigii_eze_control()` — transit consensus |
| 5–6 | COLLAPSED → SEALED | OBI (ch2) | `nsigii_obi_receive()` — rights record sealed |

**Spring physics (Hooke's Law):**
```
F = K × E          — spring force
E_half = √(F/K)    — MAYBE threshold (half extension)
collapse_ratio = E / (F/K)   — 0.0 = not sent, 1.0 = received
```

**Constitutional rights record** is attached at COLLAPSED state:
- Sender loses retrieval rights
- Receiver gains irrevocable ownership
- EZE is accountable for MAYBE resolution within 1/e seconds

---

## Suffering Formula

```
Σ = (N − R) × K

N = unmet need magnitude
R = available resource
K = constraint multiplier

Σ → 0 means the need is met. The machine holds Σ, not the person.
```

Resource types (Maslow Tier 1):
- `FOOD` — caloric delivery
- `WATER` — hydration delivery
- `SHELTER` — housing provision
- `WARMTH` — thermal provision
- `REST` — recovery provision

---

## Android APK (Native)

The NSIGII Android app runs the full protocol via a native JNI layer (`libnsigii_core.so`). The phone itself acts as the drone prototype — physical movement maps to drone movement.

### Architecture

```
NSIGIIMainActivity.java
  ├── DroneController.java        — state machine + JNI calls
  ├── DriftSensor.java            — accelerometer → drift vector
  ├── MarcoPolo.java              — sound on approach (Dr < threshold)
  └── RadarView.java              — phosphor-green radar display

JNI layer (libnsigii_core.so):
  nsigii_jni.c     — consensus, drift, discriminant, welfare, MASMIC
  polycall_jni.c   — LibPolyCall state machine (PENDING→DONE lifecycle)

C core:
  mmuko.c              — 3-bit consent/consensus reduction engine
  drift_theorem.c      — V(t)=P-C, Dr, Dω, W=(2/3)P+(1/3)C
  loopback_ping.c      — Marco Polo, LMAC, theta
  astar_tripolar.c     — A* + tripolar routing
  nsigii.c             — ObixProbe, ObixGraph state machine
  nsigii_magnetic.c    — MASMIC magnetic model (UCHE/EZE/OBI)
  polycall_state_machine.c — LibPolyCall state engine
```

### JNI Methods

**Consensus & Drift (DroneController):**
```java
native int    nativeReduceConsensus(int here, int when, int there)
native int    nativeNegateConsensus(int consensus)
native float  nativeComputeDrift(float px,py,pz, cx,cy,cz)
native float[] nativeComputeIntercept(float px,py,pz, cx,cy,cz)
native float  nativeProbeDiscriminant(float a, float b, float c)
native float  nativeWelfare(float t, float cost, float payload)
```

**MASMIC Magnetic Model (NSIGIIMainActivity):**
```java
native boolean nativeUcheEncode(String content, float force, float stiffness)
native int     nativeEzeControl(float extension, float force, float stiffness)
native boolean nativeObiReceive(float extension, float force, float stiffness)
native int     nativeMagTeleport(String content, float force, float stiffness)
native float   nativeMagCollapseRatio(float extension, float force, float k)
```

**LibPolyCall State Machine (NSIGIIMainActivity):**
```java
native boolean nativePolycallInit()
native int     nativePolycallTransition(int toStateId)
native String  nativePolycallGetState()
native int     nativePolycallGetStatus()
native void    nativePolycallReset()
```

### Building the APK

Prerequisites:
- Android Studio with NDK (API 21+)
- Android SDK 34

```bash
cd android
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk
```

NDK build only:
```bash
cd android/jni
$ANDROID_NDK/ndk-build NDK_APPLICATION_MK=Application.mk
```

---

## Native Core Build

### Prerequisites

**Windows (MSYS2/MinGW64):**
```bash
pacman -S mingw-w64-x86_64-gcc mingw-w64-x86_64-openssl mingw-w64-x86_64-make
```

**Linux / WSL:**
```bash
sudo apt-get install build-essential libssl-dev
```

### Build Tripartite Trident

```bash
cd core/relay
make all            # ch0 + ch1 + ch2 + websocket
make build-tripartite  # ch0 + ch1 + ch2 only
make lib            # shared library libnsigii.so
```

Individual channels:
```bash
make ch0     # UCHE Transmitter → bin/nsigii_ch0
make ch1     # EZE  Receiver    → bin/nsigii_ch1
make ch2     # OBI  Verifier    → bin/nsigii_ch2
```

### Run Order (start in this order, each in a separate terminal)

```bash
make run-websocket  # 1. WebSocket broadcast hub (port 8080)
make run-ch2        # 2. OBI Verifier+Broadcaster (port 8003)
make run-ch1        # 3. EZE Receiver (port 8002 → forwards to ch2)
make run-ch0        # 4. UCHE Transmitter (port 8001)
```

Or see instructions:
```bash
make run-all
```

---

## LibPolyCall Integration

LibPolyCall provides the polyglot FFI state machine used by NSIGII for zero-trust protocol transitions.

```
libpolycall-v1/
  libpolycall-v1/src/
    polycall_state_machine.c   — stateful lifecycle with integrity checks
    polycall_protocol.c        — polymorphic protocol handler
    polycall_tokenizer.c       — token stream parser
  bindings/
    java-polycall/             — Java JNI bindings
    pypolycall/                — Python bindings
    go-polycall/               — Go bindings
    node-polycall/             — Node.js bindings
```

The LibPolyCall state machine mirrors the NSIGII packet lifecycle:
```
PENDING → LOADED → FILTER → FLASH → DONE
```

Guard conditions enforce that FLASH can only be reached when consensus = `0b111`.

---

## Project Structure

```
NSIGII/
  android/                     — Android APK project
    jni/
      Android.mk               — NDK build (corrected from Andriod.mk)
      Application.mk           — ABI/platform/STL configuration
      nsigii_jni.c             — JNI bridge: consensus, drift, MASMIC
      polycall_jni.c           — JNI bridge: LibPolyCall state machine
    app/src/main/
      AndroidManifest.xml
      java/com/obinexus/nsigii/
        NSIGIIMainActivity.java
        drone/DroneController.java
        sensor/DriftSensor.java
        sound/MarcoPolo.java
        ui/RadarView.java
  core/
    consensus/mmuko.c           — 3-bit consent reduction engine
    drift/drift_theorem.c       — V(t)=P-C kinematics
    drone/nsigii_magnetic.c     — MASMIC magnetic semantic layer
    loopback/loopback_ping.c    — Marco Polo protocol, LMAC
    packet/nsigii.c             — ObixProbe, ObixGraph
    packet/nsigii_packet.h      — Packet structures (trident, suffering, LMAC)
    relay/
      ch0/                     — UCHE Transmitter (ORDER/WRITE)
      ch1/                     — EZE Receiver (forwards to ch2)
      ch2/                     — OBI Verifier + Broadcaster (EXECUTE)
      Makefile
    routing/astar_tripolar.c    — A* + tripolar heuristic
  libpolycall-v1/              — Polyglot FFI state machine
  TRANSCRIPTS/                 — Design philosophy recordings
  pseudocode/                  — System specifications
  docs/                        — Supporting documentation
```

---

## Web Interface

The WebSocket server (port 8080) serves a real-time dashboard:

```
http://localhost:8080/
```

ch2 also broadcasts consensus JSON to UDP multicast `239.255.42.99:9003`:
```json
{
  "channel": 2,
  "pole": "OBI",
  "bearing": 265,
  "axiom": "collapse=received",
  "consensus_score": 0.8914,
  "verified": true,
  "wheel_position": 240,
  "resource_types": ["FOOD", "WATER", "SHELTER"],
  "human_rights": true,
  "flash_committed": true
}
```

---

## Troubleshooting

**Port already in use:**
```bash
# Linux
kill $(lsof -t -i:8002) $(lsof -t -i:8003)
# Windows
netstat -ano | findstr "800[123]"
taskkill /PID <pid> /F
```

**OpenSSL headers missing:**
```bash
# MSYS2
pacman -S mingw-w64-x86_64-openssl
# Ubuntu/WSL
sudo apt-get install libssl-dev
```

**NDK build fails:**
- Ensure `ANDROID_NDK` environment variable is set
- Minimum NDK API 21 required
- Use `Application.mk` (not `Andriod.mk` — the typo file is kept for reference only)

**JNI UnsatisfiedLinkError:**
- Verify `System.loadLibrary("nsigii_core")` runs before any `native` calls
- Check `adb logcat` for `NSIGII_JNI` tag

---

## License

Dual-licensed — see `LICENSE/` for full specification.

## Author

Nnamdi Michael Okpala — OBINexus Computing

## References

- Rectorial Reasoning Rational Wheel Framework (11 February 2026 transcript)
- NSIGII Trident Command & Control Human Rights Verification System (transcript)
- Electronic Magnetic State Machines for Model Run and Compile Time Interoperability (19 March 2026)
- NSIGII Encoding Suffering into Silicon — Filter and Flash Sequence
- LibPolyCall — "All Bindings Are Drivers" polyglot FFI framework
- MMUKO OS — Machine Memory Using Knowledge Operations
