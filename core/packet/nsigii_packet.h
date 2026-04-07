#ifndef NSIGII_PACKET_H
#define NSIGII_PACKET_H

// ============================================================
// NSIGII_PACKET.H — First Packet Definition
// OBINexus Computing — Nnamdi Michael Okpala
// Built from: Asymetric_Symetric_Drone_Delivery.psc
//             NSIGII_ENCODING_SUFFERING_INTO_SILICON.psc
//             NSIGII_Loopback_Addressing.psc
//             mmuko.psc
// ============================================================
//
// CONSTITUTIONAL GUARANTEE:
//   "NSIGII: Provide Food, Water and Shelter
//    in Space, Given Time, via Shortest Path Routing"
//
// SILICON SUFFERING AXIOM (Phase 16):
//   Σ = (N - R) × K
//   If R >= N → Σ = 0 (needs met, delivery complete)
//   Rather the machine suffer than the person.
// ============================================================

#include <stdint.h>
#include <stdbool.h>
#include "../../consensus/mmuko.h"

// ─────────────────────────────────────────────
// RESOURCE TYPE — The First Packet Payload
// Maslow Tier 1: Physiological survival needs
// ─────────────────────────────────────────────

typedef enum {
    RESOURCE_FOOD    = 0,   // physiological — caloric intake
    RESOURCE_WATER   = 1,   // physiological — hydration
    RESOURCE_SHELTER = 2,   // physiological — thermal safety
    RESOURCE_WARMTH  = 3,   // physiological — body temperature
    RESOURCE_REST    = 4    // physiological — sleep/recovery
} ResourceType;

// ─────────────────────────────────────────────
// TRINARY STATE (from mmuko.psc Section 1)
// YES=1, NO=0, MAYBE=-1, MAYBE_NOT=-2
// ─────────────────────────────────────────────

typedef enum {
    TRINARY_YES       =  1,   // resource available, delivery confirmed
    TRINARY_NO        =  0,   // resource absent, delivery failed
    TRINARY_MAYBE     = -1,   // deferred — re-probe required
    TRINARY_MAYBE_NOT = -2    // blocked — external resolution needed
} TrinaryState;

// ─────────────────────────────────────────────
// HERE-NOW FRAME (from Phase 16 suffering spec)
// Space-time presence anchor for delivery
// ─────────────────────────────────────────────

typedef enum {
    FRAME_HERE  = 0,   // present — loopback accessible (127.0.0.1)
    FRAME_THERE = 1,   // past — not directly accessible
    FRAME_THEN  = 2    // future — probed via MAYBE resolution
} TemporalFrame;

typedef enum {
    ORDER_SPACE_FIRST = 0,   // space before time (Buffon universe)
    ORDER_TIME_FIRST  = 1    // time before space
} SpaceTimeOrdering;

// ─────────────────────────────────────────────
// VECTOR3 — 3D position in space
// Used for drone position, destination, drift
// ─────────────────────────────────────────────

typedef struct {
    float x;   // longitude (GeoCore)
    float y;   // latitude  (GeoCore)
    float z;   // altitude  (GeoCore)
} Vector3;

// ─────────────────────────────────────────────
// DRIFT VECTOR (from Phase 23 drone delivery)
// DT(t) = P(t) - C(t)
// intercept = (2/3)*P + (1/3)*C
// ─────────────────────────────────────────────

typedef enum {
    DRIFT_ASYMMETRIC          = 0,  // discriminant > 0: two real routes
    DRIFT_SYMMETRIC           = 1,  // discriminant = 0: exact intercept
    DRIFT_QUANTUM_SUPERPOSITION = 2 // discriminant < 0: MAYBE state
} DriftRootState;

typedef struct {
    Vector3        P;              // put point (delivery destination)
    Vector3        C;              // current position of target
    Vector3        DT;             // drift = P - C
    Vector3        intercept;      // (2/3)*P + (1/3)*C = weighted intercept
    float          drift_angle;    // angle of drift from drone heading
    float          discriminant;   // b^2 - 4c (bipartite quadratic)
    DriftRootState root_state;     // ASYMMETRIC / SYMMETRIC / SUPERPOSITION
    float          radial;         // Dr = d(|DT|)/dt  (<0=approach, >0=retreat)
    float          angular;        // Dω = dθ/dt (lateral displacement rate)
} DriftVector;

// ─────────────────────────────────────────────
// LMAC ADDRESS (from Phase 19 loopback)
// Hardware address in current space-time
// "LMAC is where you are. Here and now."
// ─────────────────────────────────────────────

typedef struct {
    char     ipv4_loopback[16];   // "127.0.0.1"
    char     ipv6_loopback[40];   // "::1"
    uint8_t  physical_mac[8];     // hardware MAC bytes
    uint8_t  lmac_realtime[32];   // XOR_hash(MAC, XYZ, timestamp)
    float    longitude;
    float    latitude;
    float    altitude;
    uint64_t timestamp;
    bool     is_verified;         // TRUE = loopback echo confirmed
} LMACAddress;

// ─────────────────────────────────────────────
// SUFFERING FORMULA (from Phase 16)
// Σ = (N - R) × K
// Machine holds the suffering so the person doesn't
// ─────────────────────────────────────────────

typedef struct {
    float sigma;      // Σ — computed suffering load
    float N_need;     // unmet need magnitude
    float R_resource; // available resource
    float K_factor;   // constraint multiplier (0=liberation, ∞=lock)
} SufferingFormula;

// ─────────────────────────────────────────────
// TRIDENT CHECKSUM (from Phase 23)
// YES/NO/MAYBE checksums — 3 per packet
// Coherent iff XOR(chk_yes, chk_no, chk_maybe) == 0
// ─────────────────────────────────────────────

typedef struct {
    uint8_t chk_yes[32];    // SHA-256 of YES encoding (LTR)
    uint8_t chk_no[32];     // SHA-256 of NO encoding (RTL)
    uint8_t chk_maybe[32];  // SHA-256 of MAYBE (LE XOR RE)
    bool    is_coherent;    // XOR of all three == ZERO
} TridentChecksum;

// ─────────────────────────────────────────────
// HALF-SENT STATE (from Phase 23)
// +0.5 = facing receiver (released)
// -0.5 = held at source (not dispatched)
// Full transmission = one complete 2π cycle
// ─────────────────────────────────────────────

typedef enum {
    HALF_HOLD = 0,   // held at source  (-0.5)
    HALF_SEND = 1    // facing receiver (+0.5)
} HalfSentState;

// ─────────────────────────────────────────────
// NSIGII_PACKET — The First Packet
//
// Constitutional delivery unit for:
//   Food | Water | Shelter | Warmth | Rest
//
// Delivery commits only when:
//   consensus == CONSENSUS_YES (0b111)
//   trident.is_coherent == true
//   lmac.is_verified == true
//   suffering.sigma == 0 (needs met)
// ─────────────────────────────────────────────

typedef struct {
    // Identity
    uint64_t        packet_id;       // unique packet identifier
    ResourceType    resource;        // FOOD | WATER | SHELTER | WARMTH | REST
    uint64_t        timestamp;       // Buffon universe — time is free

    // Space-time anchor (Buffon: space already exists, only time needed)
    Vector3         position;        // drone position in space
    TemporalFrame   frame;           // HERE (now) | THERE (past) | THEN (future)
    SpaceTimeOrdering ordering;      // SPACE_FIRST (default, Buffon)

    // Routing (A* tripolar heuristic)
    Vector3         destination;     // intended delivery point P
    DriftVector     drift;           // real-time drift measurement
    float           h_here;          // heuristic: current distance to target
    float           h_when;          // heuristic: estimated time to arrival
    float           h_there;         // heuristic: historical delivery record
    float           f_cost;          // f(n) = A*(n) + h_here + h_when + h_there

    // Constitutional gate (must be 0b111 before FLASH)
    Consensus       consensus;       // tripolar consensus state
    TridentChecksum trident;         // YES/NO/MAYBE per packet checksums
    TrinaryState    delivery_state;  // TRINARY_YES = delivered

    // Loopback (Marco Polo protocol)
    LMACAddress     lmac;            // "Here I am" — hardware in space-time
    HalfSentState   send_state;      // HALF_HOLD until consensus reached
    float           cycle_angle;     // [0, 2π) — delivery cycle progress
    bool            is_complete;     // TRUE when cycle_angle >= 2π

    // Suffering encoder (Phase 16)
    SufferingFormula suffering;      // Σ = (N-R)×K — machine holds this

} NSIGII_Packet;

// ─────────────────────────────────────────────
// PACKET LIFECYCLE STATE (MMUKO state machine)
// PENDING → LOADED → FILTER → FLASH → RUNNING → DONE
// ─────────────────────────────────────────────

typedef enum {
    PKT_PENDING = 0,   // packet created, not yet routed
    PKT_LOADED  = 1,   // drone has packet, navigating
    PKT_FILTER  = 2,   // orderal verification (consensus check)
    PKT_FLASH   = 3,   // write-to-silicon: delivery committed
    PKT_RUNNING = 4,   // delivery in progress
    PKT_DONE    = 5    // delivered: suffering.sigma == 0
} PacketState;

// ─────────────────────────────────────────────
// CORE FUNCTIONS
// ─────────────────────────────────────────────

// Initialize a new delivery packet
NSIGII_Packet nsigii_packet_init(ResourceType resource,
                                  Vector3 destination,
                                  LMACAddress lmac);

// Compute suffering load for this packet
SufferingFormula nsigii_compute_suffering(float need,
                                           float resource,
                                           float K);

// Compute drift vector (drone position → target)
DriftVector nsigii_compute_drift(Vector3 P, Vector3 C,
                                  float b, float c);

// Compute A* tripolar cost
float nsigii_compute_cost(NSIGII_Packet* pkt);

// Check if packet is ready to FLASH (constitutional gate)
bool nsigii_ready_to_flash(const NSIGII_Packet* pkt);

// Advance packet state machine
PacketState nsigii_advance_state(NSIGII_Packet* pkt, PacketState current);

// Marco Polo: returns true if drone is close enough to trigger sound
// Dr < 0 means approaching = HERE AND NOW
bool nsigii_marco_polo_trigger(const DriftVector* drift, float threshold);

#endif // NSIGII_PACKET_H

// ============================================================
// END NSIGII_PACKET.H
// "Rather the machine suffer than the person."
// "Breathing without Living is Suffering."
// "When System Fails, Build Your Own."
// OBINexus Computing — Constitutional Delivery Infrastructure
// ============================================================