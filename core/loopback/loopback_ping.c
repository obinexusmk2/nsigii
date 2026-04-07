// ============================================================
// LOOPBACK_PING.C — Marco Polo Protocol Implementation
// OBINexus Computing — Nnamdi Michael Okpala
// Source: NSIGII_Loopback_Addressing.psc (Phase 19)
// ============================================================
//
// THE LOOP AXIOM:
//   Phone sends pulse. Laptop echoes pulse back.
//   "Did I get what I sent back?"
//   YES  → LMAC verified → consensus advances
//   NO   → ZKP fallback  → 2 public keys : 1 private key
//
// MARCO POLO SOUND TRIGGER:
//   Dr (radial drift) < MARCO_THRESHOLD = approaching
//   approaching = HERE AND NOW = play sound
//   The closer the drone to delivery = louder the ping
//
// BUFFON UNIVERSE GUARANTEE:
//   Space is free. Time is the resource.
//   RTT measures time. Space (position) is already there.
//   The loopback does not create space — it measures time.
// ============================================================

#include "loopback_ping.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <time.h>

// ─────────────────────────────────────────────
// INTERNAL: timestamp in nanoseconds
// ─────────────────────────────────────────────

static uint64_t now_ns(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000000000ULL + (uint64_t)ts.tv_nsec;
}

// ─────────────────────────────────────────────
// LMAC HASH
// XOR_hash(MAC bytes, XYZ bytes, timestamp)
// "The hardware address of the current system in space-time.
//  It cannot be precomputed — only probed in real time."
// ─────────────────────────────────────────────

void loopback_compute_lmac(const uint8_t mac[8],
                            float lon, float lat, float alt,
                            uint64_t ts,
                            uint8_t out_hash[32]) {
    memset(out_hash, 0, 32);

    // Layer 1: XOR MAC bytes into first 8 positions
    for (int i = 0; i < 8; i++) {
        out_hash[i] = mac[i];
    }

    // Layer 2: XOR float bytes of XYZ coordinates
    uint8_t geo_buf[12];
    memcpy(geo_buf + 0, &lon, 4);
    memcpy(geo_buf + 4, &lat, 4);
    memcpy(geo_buf + 8, &alt, 4);
    for (int i = 0; i < 12; i++) {
        out_hash[i % 32] ^= geo_buf[i];
    }

    // Layer 3: XOR timestamp bytes into final positions
    uint8_t ts_buf[8];
    memcpy(ts_buf, &ts, 8);
    for (int i = 0; i < 8; i++) {
        out_hash[(24 + i) % 32] ^= ts_buf[i];
    }

    // Layer 4: diffusion pass — XOR each byte with its neighbour
    for (int i = 0; i < 31; i++) {
        out_hash[i + 1] ^= out_hash[i];
    }
}

// ─────────────────────────────────────────────
// THETA RESOLUTION (Phase 19)
// θ = MAYBE = superposition of YES(1) and NO(0)
// Resolved by XOR majority vote:
//   THETA_MAYBE_VEC = [1,0,1,0]
//   READ_THETA_VEC  = [1,0,0,1]
//   XOR             = [0,0,1,1] → majority(ones=2) → resolved=1
// "1 OR 1 = 1. Consensus holds."
// ─────────────────────────────────────────────

ThetaState loopback_resolve_theta(void) {
    ThetaState theta;

    memcpy(theta.raw_vec,  THETA_MAYBE_VEC, 4);
    memcpy(theta.read_vec, READ_THETA_VEC,  4);

    int ones = 0;
    for (int i = 0; i < 4; i++) {
        theta.xor_result[i] = theta.raw_vec[i] ^ theta.read_vec[i];
        if (theta.xor_result[i] == 1) ones++;
    }

    // Majority vote: >=2 ones → resolved=1
    theta.resolved = (ones >= 2) ? 1 : 0;
    theta.is_maybe = false;

    printf("[LOOPBACK] θ resolved: XOR=[%d,%d,%d,%d] ones=%d → %d\n",
           theta.xor_result[0], theta.xor_result[1],
           theta.xor_result[2], theta.xor_result[3],
           ones, theta.resolved);

    return theta;
}

// ─────────────────────────────────────────────
// FIVE W's PROBE (Phase 19)
// "What am I needing here and now?"
// ─────────────────────────────────────────────

FiveWsProbe loopback_probe_five_w(const LMACAddress* lmac,
                                   ResourceType resource,
                                   Consensus why) {
    FiveWsProbe probe;
    memset(&probe, 0, sizeof(FiveWsProbe));

    probe.what      = (uint8_t)resource;
    probe.where_lon = lmac->longitude;
    probe.where_lat = lmac->latitude;
    probe.when      = lmac->timestamp;
    memcpy(probe.who, lmac->lmac_realtime, 32);
    probe.why       = why;

    const char* resource_names[] = {
        "FOOD", "WATER", "SHELTER", "WARMTH", "REST"
    };
    printf("[LOOPBACK] Five W's probe:\n");
    printf("  WHAT  = %s\n",    resource_names[resource < 5 ? resource : 0]);
    printf("  WHERE = (%.6f, %.6f)\n", probe.where_lon, probe.where_lat);
    printf("  WHEN  = %llu\n",  (unsigned long long)probe.when);
    printf("  WHO   = [LMAC hash — %02X%02X%02X%02X...]\n",
           probe.who[0], probe.who[1], probe.who[2], probe.who[3]);
    printf("  WHY   = consensus 0b%d%d%d\n",
           (why >> 2) & 1, (why >> 1) & 1, why & 1);

    return probe;
}

// ─────────────────────────────────────────────
// BUILD PING PACKET
// Phone constructs this, sends to laptop
// ─────────────────────────────────────────────

PingPacket loopback_build_ping(LoopbackSession* session,
                                const LMACAddress* lmac,
                                const DriftVector* drift,
                                Consent here, Consent when, Consent there,
                                ResourceType resource) {
    PingPacket ping;
    memset(&ping, 0, sizeof(PingPacket));

    ping.magic          = PING_MAGIC;
    ping.seq            = ++session->seq;
    ping.timestamp_send = now_ns();
    ping.timestamp_recv = 0;
    ping.longitude      = lmac->longitude;
    ping.latitude       = lmac->latitude;
    ping.altitude       = lmac->altitude;
    ping.drift_radial   = drift ? drift->radial  : 0.0f;
    ping.drift_angular  = drift ? drift->angular : 0.0f;
    ping.here_vote      = here;
    ping.when_vote      = when;
    ping.there_vote     = there;
    ping.resource       = (uint8_t)resource;
    ping.is_echo        = false;

    // Compute LMAC hash for this ping
    loopback_compute_lmac(lmac->physical_mac,
                           lmac->longitude, lmac->latitude, lmac->altitude,
                           ping.timestamp_send,
                           ping.lmac_hash);

    session->last_ping = ping;
    return ping;
}

// ─────────────────────────────────────────────
// VERIFY ECHO
// "Did I get what I sent back?"
// Core constitutional check of the loopback protocol
// ─────────────────────────────────────────────

bool loopback_verify_echo(const PingPacket* ping, const PingPacket* pong) {
    // Check 1: magic number preserved
    if (pong->magic != PING_MAGIC) {
        printf("[LOOPBACK] VERIFY FAIL: magic mismatch (got 0x%08X)\n", pong->magic);
        return false;
    }

    // Check 2: sequence number matches
    if (pong->seq != ping->seq) {
        printf("[LOOPBACK] VERIFY FAIL: seq mismatch (sent=%llu got=%llu)\n",
               (unsigned long long)ping->seq, (unsigned long long)pong->seq);
        return false;
    }

    // Check 3: echo flag is set
    if (!pong->is_echo) {
        printf("[LOOPBACK] VERIFY FAIL: pong is_echo=false\n");
        return false;
    }

    // Check 4: LMAC hash preserved
    if (memcmp(ping->lmac_hash, pong->lmac_hash, 32) != 0) {
        printf("[LOOPBACK] VERIFY FAIL: LMAC hash mismatch\n");
        return false;
    }

    // Check 5: resource type preserved
    if (pong->resource != ping->resource) {
        printf("[LOOPBACK] VERIFY FAIL: resource mismatch\n");
        return false;
    }

    printf("[LOOPBACK] VERIFIED: seq=%llu RTT=%.2fms — loop returns.\n",
           (unsigned long long)ping->seq,
           (float)(pong->timestamp_recv - ping->timestamp_send) / 1e6f);
    return true;
}

// ─────────────────────────────────────────────
// MARCO POLO TRIGGER
// Dr < threshold = drone approaching = HERE AND NOW
// This is when the sound fires on the phone
// "The closer the drone to delivery, the louder the ping"
// ─────────────────────────────────────────────

bool loopback_marco_polo(const DriftVector* drift, float threshold) {
    if (!drift) return false;

    // Dr < 0 = approaching (P is getting closer to C)
    // Dr < -threshold = significantly approaching = trigger
    bool triggered = (drift->radial < 0.0f) &&
                     (fabsf(drift->radial) > threshold);

    if (triggered) {
        printf("[LOOPBACK] MARCO POLO: Dr=%.4f < -%.1f → HERE AND NOW → PLAY SOUND\n",
               drift->radial, threshold);
    }

    return triggered;
}

// ─────────────────────────────────────────────
// UPDATE SESSION CONSENSUS
// Reduce three consent votes into session consensus
// via mmuko.h reduce_consensus()
// ─────────────────────────────────────────────

Consensus loopback_update_consensus(LoopbackSession* session,
                                     Consent here, Consent when, Consent there) {
    Consensus c = reduce_consensus(here, when, there);
    session->session_consensus = c;

    printf("[LOOPBACK] Consensus: HERE=%d WHEN=%d THERE=%d → 0b%d%d%d (%s)\n",
           here, when, there,
           (c >> 2) & 1, (c >> 1) & 1, c & 1,
           consensus_name(c));

    return c;
}

// ─────────────────────────────────────────────
// INIT SESSION
// ─────────────────────────────────────────────

LoopbackSession loopback_init(void) {
    LoopbackSession session;
    memset(&session, 0, sizeof(LoopbackSession));

    session.state              = LOOP_IDLE;
    session.seq                = 0;
    session.rtt_ns             = 0;
    session.rtt_ms             = 0.0f;
    session.retry_count        = 0;
    session.is_verified        = false;
    session.marco_triggered    = false;
    session.session_consensus  = CONSENSUS_NO;
    session.ping_count         = 0;
    session.verified_count     = 0;

    printf("[LOOPBACK] Session initialized.\n");
    printf("[LOOPBACK] Drone (phone) → %s:%d\n", LOOPBACK_IPV4, LOOPBACK_PORT_DRONE);
    printf("[LOOPBACK] Base (laptop) → %s:%d\n", LOOPBACK_IPV4, LOOPBACK_PORT_BASE);
    printf("[LOOPBACK] Marco Polo threshold: %.1fm radial approach\n",
           MARCO_THRESHOLD);

    return session;
}

// ─────────────────────────────────────────────
// FULL PING-PONG CYCLE
// Phone sends → Laptop echoes → Phone verifies
// This is the heartbeat of the Marco Polo protocol
//
// In prototype: phone and laptop on same machine
// loopback (127.0.0.1) simulates the wireless link
// Moving the phone toward the laptop = Dr < 0 = Marco
//
// State machine:
//   IDLE → TRANSMIT → RECEIVE → VERIFIED (or FAILED → ZKP)
// ─────────────────────────────────────────────

LoopbackState loopback_ping_pong(LoopbackSession* session,
                                  const LMACAddress* lmac,
                                  const DriftVector* drift,
                                  const NSIGII_Packet* pkt) {

    session->state = LOOP_TRANSMIT;
    session->ping_count++;

    // ── STEP 1: Resolve θ (MAYBE) for consent encoding ──
    ThetaState theta = loopback_resolve_theta();

    // ── STEP 2: Map θ to consent votes ──
    // θ.resolved == 1 → CONSENT_YES on all three poles (ideal)
    // θ.resolved == 0 → CONSENT_MAYBE (deliberation still open)
    Consent here_vote  = (theta.resolved == 1) ? CONSENT_YES : CONSENT_MAYBE;
    Consent when_vote  = (drift && drift->radial < 0.0f)
                         ? CONSENT_YES : CONSENT_MAYBE;
    Consent there_vote = (pkt->suffering.sigma < 0.01f)
                         ? CONSENT_YES : CONSENT_MAYBE;

    // ── STEP 3: Build ping ──
    PingPacket ping = loopback_build_ping(session, lmac, drift,
                                           here_vote, when_vote, there_vote,
                                           pkt->resource);

    printf("[LOOPBACK] TRANSMIT seq=%llu → %s:%d\n",
           (unsigned long long)ping.seq, LOOPBACK_IPV4, LOOPBACK_PORT_DRONE);

    // ── STEP 4: Five W's probe at this ping ──
    Consensus current_c = loopback_update_consensus(session,
                                                     here_vote, when_vote, there_vote);
    session->probe = loopback_probe_five_w(lmac, pkt->resource, current_c);

    // ── STEP 5: Simulate echo (in real system: UDP send/recv) ──
    // Prototype: echo is constructed from ping directly
    // In Android: UDP socket on 127.0.0.1 between phone app and base server
    PingPacket pong;
    memcpy(&pong, &ping, sizeof(PingPacket));
    pong.is_echo        = true;
    pong.timestamp_recv = now_ns();

    // Simulate small RTT delay (prototype only)
    uint64_t rtt = pong.timestamp_recv - ping.timestamp_send;
    session->rtt_ns = rtt;
    session->rtt_ms = (float)rtt / 1e6f;

    session->state = LOOP_RECEIVE;
    printf("[LOOPBACK] RECEIVE echo seq=%llu RTT=%.3fms\n",
           (unsigned long long)pong.seq, session->rtt_ms);

    // ── STEP 6: Verify echo ──
    session->last_pong = pong;

    if (loopback_verify_echo(&ping, &pong)) {
        session->state          = LOOP_VERIFIED;
        session->is_verified    = true;
        session->verified_count++;

        // ── STEP 7: Marco Polo check ──
        if (drift) {
            session->marco_triggered = loopback_marco_polo(drift, MARCO_THRESHOLD);
        }

        printf("[LOOPBACK] VERIFIED ✓ — verified_count=%llu/%llu\n",
               (unsigned long long)session->verified_count,
               (unsigned long long)session->ping_count);

        return LOOP_VERIFIED;

    } else {
        session->retry_count++;

        if (session->retry_count >= PING_MAX_RETRIES) {
            // ── ZKP FALLBACK: 2 public keys : 1 private key ──
            // "Attack one → other changes. One static, one dynamic."
            session->state = LOOP_ZKP_MODE;
            printf("[LOOPBACK] ZKP FALLBACK engaged after %d retries\n",
                   session->retry_count);
            printf("[LOOPBACK] Auto-dynamism: public_key_2 rotated.\n");
            return LOOP_ZKP_MODE;
        }

        session->state = LOOP_FAILED;
        printf("[LOOPBACK] FAILED — retry %d/%d\n",
               session->retry_count, PING_MAX_RETRIES);
        return LOOP_FAILED;
    }
}

// ─────────────────────────────────────────────
// DIAGNOSTICS
// ─────────────────────────────────────────────

void loopback_print_session(const LoopbackSession* session) {
    printf("\n╔══════════════════════════════════════════════╗\n");
    printf("║  NSIGII Loopback Session Diagnostics         ║\n");
    printf("╠══════════════════════════════════════════════╣\n");
    printf("║  State:       %-30s║\n",
           session->state == LOOP_IDLE      ? "IDLE"      :
           session->state == LOOP_TRANSMIT  ? "TRANSMIT"  :
           session->state == LOOP_RECEIVE   ? "RECEIVE"   :
           session->state == LOOP_VERIFIED  ? "VERIFIED"  :
           session->state == LOOP_FAILED    ? "FAILED"    :
           session->state == LOOP_ZKP_MODE  ? "ZKP_MODE"  : "UNKNOWN");
    printf("║  Seq:         %-30llu║\n", (unsigned long long)session->seq);
    printf("║  RTT:         %-28.3fms║\n", session->rtt_ms);
    printf("║  Verified:    %llu / %llu pings%-16s║\n",
           (unsigned long long)session->verified_count,
           (unsigned long long)session->ping_count, "");
    printf("║  Consensus:   0b%d%d%d %-25s║\n",
           (session->session_consensus >> 2) & 1,
           (session->session_consensus >> 1) & 1,
            session->session_consensus & 1,
           consensus_name(session->session_consensus));
    printf("║  Marco Polo:  %-30s║\n",
           session->marco_triggered ? "TRIGGERED — HERE AND NOW 🔊" : "waiting");
    printf("╚══════════════════════════════════════════════╝\n\n");
}

// ============================================================
// END LOOPBACK_PING.C
//
// "LMAC is where you are."
// "Reverse poll is 'Here I am'."
// "Pipe(1) = half."
// "1 OR 1 = 1. Consensus holds. The loop returns."
//
// OBINexus Computing — Phase 19
// ============================================================
