// ============================================================
// MMUKO.C — Constitutional Computing Core Implementation
// OBINexus Computing — Nnamdi Michael Okpala
// ============================================================
//
// Built from:
//   consensus.c    (uploaded 7 April 2026, Windows prototype)
//   mmuko.psc      (full phase specification)
//   mmuko-boot.psc (boot handoff contract)
//   Session transcripts — 7 April 2026
//
// CROSS-PLATFORM: removes windows.h dependency.
// Use mmuko_print_banner() instead of SetConsoleOutputCP.
//
// NEGATION LAW (proven in session, 7 April 2026):
//   -0b101 → flip bits → 0b010 = MAYBE_WHEN_AND_WHERE
//   -MAYBE_NOT_X == MAYBE_X  (self-inverting property)
//   Each bit is one pole's YES vote — bitwise NOT = withdrawal.
// ============================================================

#include "mmuko.h"
#include <stdio.h>

// ─────────────────────────────────────────────
// CORE REDUCTION ENGINE
//
// Each pole contributes one bit:
//   bit0 = HERE_AND_NOW   (Consent here  == YES → set bit)
//   bit1 = WHEN_AND_WHERE (Consent when  == YES → set bit)
//   bit2 = THERE_AND_THEN (Consent there == YES → set bit)
//
// Only CONSENT_YES sets a bit.
// CONSENT_MAYBE, CONSENT_MAYBE_NOT, CONSENT_NO all leave bit=0.
// This is constitutional: deliberation does not commit.
// ─────────────────────────────────────────────

Consensus reduce_consensus(Consent here, Consent when, Consent there) {
    uint8_t bits = 0;
    if (here  == CONSENT_YES) bits |= 0b001;
    if (when  == CONSENT_YES) bits |= 0b010;
    if (there == CONSENT_YES) bits |= 0b100;
    return (Consensus)bits;
}

// ─────────────────────────────────────────────
// NEGATION (proven 7 April 2026)
//
// The 3-bit consensus is self-inverting:
//   -MAYBE_NOT_X == MAYBE_X
//   0b101 → ~0b101 & 0b111 → 0b010
//
// Interpretation: negate inverts every pole vote.
// A pole that resolved (1) becomes unresolved (0).
// A pole that was holdout (0) becomes resolved (1).
//
// Used for: pole withdrawal before FLASH
// "A segment that passed FILTER can be recalled back
//  to deliberation by a negative pole vote."
// ─────────────────────────────────────────────

Consensus negate_consensus(Consensus c) {
    return (Consensus)((~(uint8_t)c) & 0b111);
}

// ─────────────────────────────────────────────
// POLE ACCESSORS
// Each bit is independently auditable — no lookup needed
// result & 0b001 → HERE_AND_NOW resolved?
// ─────────────────────────────────────────────

bool consensus_here_resolved(Consensus c) {
    return (c & 0b001) != 0;
}

bool consensus_when_resolved(Consensus c) {
    return (c & 0b010) != 0;
}

bool consensus_there_resolved(Consensus c) {
    return (c & 0b100) != 0;
}

// Constitutional FLASH gate:
// Delivery commits only when all three poles aligned
bool consensus_is_flash_ready(Consensus c) {
    return c == CONSENSUS_YES;
}

// ─────────────────────────────────────────────
// TRINARY COMPOSITION (mmuko.psc Section 1)
//
// Composition table:
//   YES  × YES    = YES       (both affirm)
//   NO   × any    = NO        (denial absorbs)
//   MAYBE× MAYBE  = YES       (double negation resolves)
//   MAYBE× YES    = MAYBE     (uncertainty persists)
//   MAYBE_NOT     absorbs all (deferred wins)
// ─────────────────────────────────────────────

TrinaryState trinary_compose(TrinaryState a, TrinaryState b) {
    if (a == TRINARY_MAYBE_NOT || b == TRINARY_MAYBE_NOT)
        return TRINARY_MAYBE_NOT;
    if (a == TRINARY_NO || b == TRINARY_NO)
        return TRINARY_NO;
    if (a == TRINARY_YES && b == TRINARY_YES)
        return TRINARY_YES;
    if (a == TRINARY_MAYBE && b == TRINARY_MAYBE)
        return TRINARY_YES;   // double negation resolves
    return TRINARY_MAYBE;
}

TrinaryState trinary_resolve(TrinaryState want,
                               TrinaryState need,
                               TrinaryState should) {
    return trinary_compose(trinary_compose(want, need), should);
}

// ─────────────────────────────────────────────
// HUMAN-READABLE NAMES
// ─────────────────────────────────────────────

const char* consent_name(Consent c) {
    switch (c) {
        case CONSENT_NO:        return "NO";
        case CONSENT_MAYBE_NOT: return "MAYBE_NOT";
        case CONSENT_MAYBE:     return "MAYBE";
        case CONSENT_YES:       return "YES";
        default:                return "UNKNOWN";
    }
}

const char* consensus_name(Consensus c) {
    switch (c) {
        case CONSENSUS_NO:
            return "NO (0b000) -- no pole resolved";
        case CONSENSUS_MAYBE_HERE_AND_NOW:
            return "MAYBE_HERE_AND_NOW (0b001) -- only HERE voted YES";
        case CONSENSUS_MAYBE_WHEN_AND_WHERE:
            return "MAYBE_WHEN_AND_WHERE (0b010) -- only WHEN voted YES";
        case CONSENSUS_MAYBE_NOT_THERE_AND_THEN:
            return "MAYBE_NOT_THERE_AND_THEN (0b011) -- HERE+WHEN resolved, THERE holdout";
        case CONSENSUS_MAYBE_THERE_AND_THEN:
            return "MAYBE_THERE_AND_THEN (0b100) -- only THERE voted YES";
        case CONSENSUS_MAYBE_NOT_WHEN_AND_WHERE:
            return "MAYBE_NOT_WHEN_AND_WHERE (0b101) -- HERE+THERE resolved, WHEN holdout";
        case CONSENSUS_MAYBE_NOT_HERE_AND_NOW:
            return "MAYBE_NOT_HERE_AND_NOW (0b110) -- WHEN+THERE resolved, HERE holdout";
        case CONSENSUS_YES:
            return "YES (0b111) -- all three poles aligned";
        default:
            return "UNKNOWN";
    }
}

const char* trinary_name(TrinaryState t) {
    switch (t) {
        case TRINARY_YES:       return "YES";
        case TRINARY_NO:        return "NO";
        case TRINARY_MAYBE:     return "MAYBE";
        case TRINARY_MAYBE_NOT: return "MAYBE_NOT";
        default:                return "UNKNOWN";
    }
}

// ─────────────────────────────────────────────
// DIAGNOSTIC PRINTER
// Cross-platform: no windows.h required
// ─────────────────────────────────────────────

void evaluate(Consent here, Consent when, Consent there) {
    Consensus result = reduce_consensus(here, when, there);
    printf("  HERE_AND_NOW=%-9s  WHEN_AND_WHERE=%-9s  THERE_AND_THEN=%-9s\n",
           consent_name(here), consent_name(when), consent_name(there));
    printf("  -> %s\n\n", consensus_name(result));
}

// ─────────────────────────────────────────────
// PRINT ALL 8 STATES WITH NEGATION
// Full constitutional map of the tripolar system
// ─────────────────────────────────────────────

void mmuko_print_all_states(void) {
    printf("=== OBINEXUS TRIPOLAR CONSENSUS REDUCTION ===\n\n");

    printf("[0b001] Only HERE_AND_NOW resolves:\n");
    evaluate(CONSENT_YES, CONSENT_NO, CONSENT_NO);

    printf("[0b000] All poles NO:\n");
    evaluate(CONSENT_NO, CONSENT_NO, CONSENT_NO);

    printf("[0b010] Only WHEN_AND_WHERE resolves:\n");
    evaluate(CONSENT_NO, CONSENT_YES, CONSENT_NO);

    printf("[0b100] Only THERE_AND_THEN resolves:\n");
    evaluate(CONSENT_NO, CONSENT_NO, CONSENT_YES);

    printf("[0b011] HERE+WHEN resolved, THERE holdout:\n");
    evaluate(CONSENT_YES, CONSENT_YES, CONSENT_NO);

    printf("[0b101] HERE+THERE resolved, WHEN holdout:\n");
    evaluate(CONSENT_YES, CONSENT_NO, CONSENT_YES);

    printf("[0b110] WHEN+THERE resolved, HERE holdout:\n");
    evaluate(CONSENT_NO, CONSENT_YES, CONSENT_YES);

    printf("[0b111] Full consensus:\n");
    evaluate(CONSENT_YES, CONSENT_YES, CONSENT_YES);

    printf("=== NEGATION LAW (-0bXXX == mirror state) ===\n\n");
    for (int i = 0; i <= 7; i++) {
        Consensus c  = (Consensus)i;
        Consensus nc = negate_consensus(c);
        printf("  negate(0b%d%d%d) -> 0b%d%d%d\n",
               (i >> 2) & 1, (i >> 1) & 1, i & 1,
               ((int)nc >> 2) & 1, ((int)nc >> 1) & 1, (int)nc & 1);
    }

    printf("\n=== FLASH GATE CHECK ===\n\n");
    for (int i = 0; i <= 7; i++) {
        Consensus c = (Consensus)i;
        printf("  0b%d%d%d  FLASH_READY=%s\n",
               (i >> 2) & 1, (i >> 1) & 1, i & 1,
               consensus_is_flash_ready(c) ? "YES" : "NO");
    }
    printf("\n");

    printf("=== TRINARY COMPOSITION ===\n\n");
    TrinaryState states[] = {
        TRINARY_YES, TRINARY_NO, TRINARY_MAYBE, TRINARY_MAYBE_NOT
    };
    const char* names[] = {"YES", "NO", "MAYBE", "MAYBE_NOT"};
    for (int i = 0; i < 4; i++) {
        for (int j = 0; j < 4; j++) {
            TrinaryState r = trinary_compose(states[i], states[j]);
            printf("  %-10s x %-10s = %s\n",
                   names[i], names[j], trinary_name(r));
        }
    }
    printf("\n");
}

// ============================================================
// END MMUKO.C
//
// "Consent cannot consensus without consent first."
// "1 OR 1 = 1. Consensus holds."
// "Filter before Flash. Always."
// "Rather the machine suffer than the person."
//
// OBINexus Computing — Constitutional Computing Core
// Nnamdi Michael Okpala — 7 April 2026
// ============================================================
