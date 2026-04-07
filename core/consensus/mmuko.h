#ifndef MMUKO_H
#define MMUKO_H

// ============================================================
// MMUKO.H — Constitutional Computing Core
// OBINexus Computing — Nnamdi Michael Okpala
// ============================================================
//
// OBINEXUS TRIPOLAR CONSENSUS REDUCTION
//
// 2-bit Consent (per entity / pole):
//   CONSENT_NO        = 0b00  definitive rejection
//   CONSENT_MAYBE_NOT = 0b01  negative lean
//   CONSENT_MAYBE     = 0b10  affirmative lean
//   CONSENT_YES       = 0b11  full affirmative
//
// 3-bit Consensus (tripolar reduction):
//   bit0 = HERE_AND_NOW
//   bit1 = WHEN_AND_WHERE
//   bit2 = THERE_AND_THEN
//
// NEGATION LAW (proven 7 April 2026):
//   -MAYBE_NOT_X == MAYBE_X
//   Negation maps a holdout state back to its mirror.
//   A pole that was YES can vote -1 to pull consensus
//   back from MAYBE_NOT toward MAYBE before FLASH.
//
// FILTER before FLASH:
//   Consent is the per-entity gate.
//   Consensus is the tripolar reduction.
//   FLASH only when consensus == CONSENSUS_YES (0b111).
//
// SUFFERING REDUCTION LAW (Phase 16):
//   Σ = (N - R) × K
//   When consensus == 0b111 → delivery → Σ → 0
//   The machine holds the suffering so the person doesn't.
// ============================================================

#include <stdint.h>
#include <stdbool.h>

// ─────────────────────────────────────────────
// 2-BIT CONSENT (per entity)
// ─────────────────────────────────────────────

typedef enum {
    CONSENT_NO        = 0b00,   // 0 — definitive rejection
    CONSENT_MAYBE_NOT = 0b01,   // 1 — negative lean
    CONSENT_MAYBE     = 0b10,   // 2 — affirmative lean
    CONSENT_YES       = 0b11    // 3 — full affirmative
} Consent;

// ─────────────────────────────────────────────
// 3-BIT CONSENSUS (tripolar reduction)
// Poles map to bits:
//   bit0 = HERE_AND_NOW
//   bit1 = WHEN_AND_WHERE
//   bit2 = THERE_AND_THEN
// ─────────────────────────────────────────────

typedef enum {
    CONSENSUS_NO                       = 0b000, // 0 no pole resolved
    CONSENSUS_MAYBE_HERE_AND_NOW       = 0b001, // 1 only HERE voted YES
    CONSENSUS_MAYBE_WHEN_AND_WHERE     = 0b010, // 2 only WHEN voted YES
    CONSENSUS_MAYBE_NOT_THERE_AND_THEN = 0b011, // 3 HERE+WHEN resolved, THERE holdout
    CONSENSUS_MAYBE_THERE_AND_THEN     = 0b100, // 4 only THERE voted YES
    CONSENSUS_MAYBE_NOT_WHEN_AND_WHERE = 0b101, // 5 HERE+THERE resolved, WHEN holdout
    CONSENSUS_MAYBE_NOT_HERE_AND_NOW   = 0b110, // 6 WHEN+THERE resolved, HERE holdout
    CONSENSUS_YES                      = 0b111  // 7 all three poles aligned
} Consensus;

// ─────────────────────────────────────────────
// TRINARY STATE (mmuko.psc Section 1)
// Used for boot handoff and phase outcomes
// ─────────────────────────────────────────────

typedef enum {
    TRINARY_YES       =  1,
    TRINARY_NO        =  0,
    TRINARY_MAYBE     = -1,
    TRINARY_MAYBE_NOT = -2
} TrinaryState;

// ─────────────────────────────────────────────
// BOOT OUTCOME
// ─────────────────────────────────────────────

typedef enum {
    MMUKO_PASS  = 0xAA,
    MMUKO_HOLD  = 0xBB,
    MMUKO_ALERT = 0xCC
} MmukoBootOutcome;

// ─────────────────────────────────────────────
// CORE REDUCTION ENGINE
// Only CONSENT_YES sets a pole bit.
// All other consent states leave it 0.
// ─────────────────────────────────────────────

Consensus reduce_consensus(Consent here, Consent when, Consent there);

// ─────────────────────────────────────────────
// NEGATION
// -MAYBE_NOT_X == MAYBE_X (self-inverting)
// Used for pole withdrawal before FLASH
// ─────────────────────────────────────────────

Consensus negate_consensus(Consensus c);

// ─────────────────────────────────────────────
// POLE ACCESSORS
// Test individual pole votes via bitwise AND
// ─────────────────────────────────────────────

bool consensus_here_resolved(Consensus c);    // bit0
bool consensus_when_resolved(Consensus c);    // bit1
bool consensus_there_resolved(Consensus c);   // bit2

// Constitutional gate: returns true only if 0b111
bool consensus_is_flash_ready(Consensus c);

// ─────────────────────────────────────────────
// TRINARY COMPOSITION (mmuko.psc Section 1)
// YES×YES=YES  NO×any=NO  MAYBE×MAYBE=YES
// ─────────────────────────────────────────────

TrinaryState trinary_compose(TrinaryState a, TrinaryState b);
TrinaryState trinary_resolve(TrinaryState want,
                              TrinaryState need,
                              TrinaryState should);

// ─────────────────────────────────────────────
// HUMAN-READABLE NAMES
// ─────────────────────────────────────────────

const char* consent_name(Consent c);
const char* consensus_name(Consensus c);
const char* trinary_name(TrinaryState t);

// ─────────────────────────────────────────────
// DIAGNOSTIC PRINTER
// ─────────────────────────────────────────────

void evaluate(Consent here, Consent when, Consent there);
void mmuko_print_all_states(void);

#endif // MMUKO_H

// ============================================================
// END MMUKO.H
// "Breathing without Living is Suffering."
// "When System Fails, Build Your Own."
// "Rather the machine suffer than the person."
// OBINexus Computing — Constitutional Core
// ============================================================
