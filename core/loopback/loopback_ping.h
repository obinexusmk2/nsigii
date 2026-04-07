#ifndef LOOPBACK_PING_H
#define LOOPBACK_PING_H

// ============================================================
// LOOPBACK_PING.H — Marco Polo Protocol
// OBINexus Computing — Nnamdi Michael Okpala
// Source: NSIGII_Loopback_Addressing.psc (Phase 19)
// ============================================================
//
// CORE AXIOM:
//   "Did I get what I sent back?"
//   LMAC = LoopBack MAC Address = hardware address in space-time
//   Reverse poll = "Here I am" — emit pulse, wait for echo
//   If echo matches broadcast: VERIFIED
//   If echo fails: ZKP 2-public-key fallback
//
// MARCO POLO PROTOCOL:
//   Phone (drone)  → TRANSMIT ping via loopback
//   Laptop (base)  → RECEIVE ping, VERIFY via Drift Theorem
//   Dr < 0         → approaching → HERE AND NOW → play sound
//   Dr > 0         → retreating → reroute
//   consensus 0b111 → FLASH → delivery committed
//
// Five W's probe (at each ping):
//   WHAT  = current resource need
//   WHERE = (longitude, latitude) from LMAC
//   WHEN  = timestamp (space-time anchor)
//   WHO   = lmac_realtime (identity)
//   WHY   = current consensus state
// ============================================================

#include <stdint.h>
#include <stdbool.h>
#include "../packet/nsigii_packet.h"
#include "../consensus/mmuko.h"

// ─────────────────────────────────────────────
// LOOPBACK CONSTANTS (from Phase 19 spec)
// ─────────────────────────────────────────────

#define LOOPBACK_IPV4          "127.0.0.1"
#define LOOPBACK_IPV6          "::1"
#define LOOPBACK_PORT_DRONE    9001   // phone → laptop
#define LOOPBACK_PORT_BASE     9002   // laptop → phone
#define PING_PAYLOAD_SIZE      64     // bytes per pulse
#define PING_TIMEOUT_MS        500    // echo timeout
#define PING_MAX_RETRIES       3      // before ZKP fallback
#define MARCO_THRESHOLD        5.0f   // Dr threshold for sound trigger (metres)

// θ vectors (from Phase 19 loopback spec)
// θ = MAYBE = superposition of YES(1) and NO(0)
// Resolved by XOR: THETA_MAYBE_VEC XOR READ_THETA_VEC
static const uint8_t THETA_MAYBE_VEC[4] = {1, 0, 1, 0};
static const uint8_t READ_THETA_VEC[4]  = {1, 0, 0, 1};

// ─────────────────────────────────────────────
// PING PACKET — the loopback pulse
// Sent by phone (drone), echoed by laptop (base)
// ─────────────────────────────────────────────

#define PING_MAGIC 0x4E534947  // "NSIG"

typedef struct {
    uint32_t magic;             // 0x4E534947 = "NSIG"
    uint64_t seq;               // sequence number
    uint64_t timestamp_send;    // when sent (nanoseconds)
    uint64_t timestamp_recv;    // when echo received
    uint8_t  lmac_hash[32];     // XOR_hash(MAC, XYZ, ts)
    float    longitude;
    float    latitude;
    float    altitude;
    float    drift_radial;      // Dr from last measurement
    float    drift_angular;     // Dω from last measurement
    Consent  here_vote;         // HERE_AND_NOW pole vote
    Consent  when_vote;         // WHEN_AND_WHERE pole vote
    Consent  there_vote;        // THERE_AND_THEN pole vote
    uint8_t  resource;          // ResourceType being delivered
    bool     is_echo;           // FALSE=ping, TRUE=pong
} PingPacket;

// ─────────────────────────────────────────────
// FIVE W's PROBE RESULT (from Phase 19)
// ─────────────────────────────────────────────

typedef struct {
    uint8_t  what;       // ResourceType — what is needed
    float    where_lon;  // WHERE — longitude
    float    where_lat;  // WHERE — latitude
    uint64_t when;       // WHEN  — timestamp anchor
    uint8_t  who[32];    // WHO   — lmac_realtime identity
    Consensus why;       // WHY   — current consensus state
} FiveWsProbe;

// ─────────────────────────────────────────────
// LOOPBACK SESSION — full ping/pong state
// ─────────────────────────────────────────────

typedef enum {
    LOOP_IDLE       = 0,  // not started
    LOOP_TRANSMIT   = 1,  // ping sent, waiting for echo
    LOOP_RECEIVE    = 2,  // echo received, verifying
    LOOP_VERIFIED   = 3,  // "Did I get what I sent back? YES."
    LOOP_FAILED     = 4,  // echo mismatch — ZKP fallback
    LOOP_ZKP_MODE   = 5   // operating on 2-public-key fallback
} LoopbackState;

typedef struct {
    LoopbackState state;
    uint64_t      seq;              // current sequence number
    uint64_t      rtt_ns;           // round-trip time nanoseconds
    float         rtt_ms;           // round-trip time milliseconds
    int           retry_count;      // retries before ZKP fallback
    bool          is_verified;      // echo confirmed
    bool          marco_triggered;  // sound should play
    PingPacket    last_ping;        // last sent packet
    PingPacket    last_pong;        // last received echo
    FiveWsProbe   probe;            // five W's at last ping
    Consensus     session_consensus; // aggregate consensus this session
    uint64_t      ping_count;       // total pings sent
    uint64_t      verified_count;   // total verified echoes
} LoopbackSession;

// ─────────────────────────────────────────────
// THETA STATE — MAYBE resolution (Phase 19)
// θ = XOR(THETA_MAYBE_VEC, READ_THETA_VEC)
// ─────────────────────────────────────────────

typedef struct {
    uint8_t raw_vec[4];     // [1,0,1,0]
    uint8_t read_vec[4];    // [1,0,0,1]
    uint8_t xor_result[4];  // XOR of above
    int     resolved;       // 0 or 1 — majority vote
    bool    is_maybe;       // TRUE = still superposed
} ThetaState;

// ─────────────────────────────────────────────
// FUNCTION DECLARATIONS
// ─────────────────────────────────────────────

// Initialize loopback session
LoopbackSession loopback_init(void);

// Build ping packet from LMAC + drift + consent votes
PingPacket loopback_build_ping(LoopbackSession* session,
                                const LMACAddress* lmac,
                                const DriftVector* drift,
                                Consent here, Consent when, Consent there,
                                ResourceType resource);

// Verify echo against sent ping
// "Did I get what I sent back?"
bool loopback_verify_echo(const PingPacket* ping, const PingPacket* pong);

// Compute LMAC hash: XOR(MAC bytes, XYZ bytes, timestamp)
void loopback_compute_lmac(const uint8_t mac[8],
                            float lon, float lat, float alt,
                            uint64_t ts,
                            uint8_t out_hash[32]);

// Resolve θ (MAYBE) via XOR majority vote
ThetaState loopback_resolve_theta(void);

// Five W's probe at current position
FiveWsProbe loopback_probe_five_w(const LMACAddress* lmac,
                                   ResourceType resource,
                                   Consensus why);

// Marco Polo trigger: Dr < threshold → HERE AND NOW → play sound
bool loopback_marco_polo(const DriftVector* drift, float threshold);

// Update session consensus from ping votes
Consensus loopback_update_consensus(LoopbackSession* session,
                                     Consent here, Consent when, Consent there);

// Full send-receive cycle (blocking, with timeout)
// Returns LOOP_VERIFIED or LOOP_FAILED
LoopbackState loopback_ping_pong(LoopbackSession* session,
                                  const LMACAddress* lmac,
                                  const DriftVector* drift,
                                  const NSIGII_Packet* pkt);

// Print session diagnostics
void loopback_print_session(const LoopbackSession* session);

#endif // LOOPBACK_PING_H

// ============================================================
// END LOOPBACK_PING.H
// "LMAC is where you are. Reverse poll is 'Here I am'."
// "1 OR 1 = 1. Consensus holds. The loop returns."
// OBINexus Computing — Phase 19
// ============================================================