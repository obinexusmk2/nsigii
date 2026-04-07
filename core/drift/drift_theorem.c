// ============================================================
// DRIFT_THEOREM.C — Self-Referential Spatial Observer
// OBINexus Computing — Nnamdi Michael Okpala
// ============================================================
//
// "It's tracking itself."
// "The camera knows where it is in space and time."
// "No machine learning — pure vector mathematics."
//
// DRIFT THEOREM (formal):
//   V(t) = P(t) - C(t)
//   D(t) = dV(t)/dt
//   Dr   = d(|V|)/dt       radial component
//   Dω   = dθ/dt           angular component
//   W(t) = (2/3)P + (1/3)C weighted navigate-to intercept
//
// FOUR STATES (live OpenCV demo):
//   GREEN  → Dr < 0        approaching, ZKP verified
//   ORANGE → self-track    camera on own center
//   RED    → Dr > 0, Dω>0  retreating or angular drift
//   BLUE   → Dr ≈ 0, Dω≈0  still, no drift
//
// RED SHIFT CONNECTION:
//   "Drift + angle = red shift"
//   Moving at 45° angle = drifting away from observer frame
//   Like Doppler: wavelength stretches as source retreats
//   Dr > 0 AND Dω > 0 = angular retreat = red shift state
//
// BIPARTITE DISCRIMINANT (from Phase 23):
//   Δ = b² - 4c
//   Δ > 0: ASYMMETRIC   — two real delivery paths
//   Δ = 0: SYMMETRIC    — exact intercept (drone on line)
//   Δ < 0: SUPERPOSITION — MAYBE state, defer to consensus
// ============================================================

#include "drift_theorem.h"
#include <math.h>
#include <string.h>
#include <stdio.h>
#include <time.h>

// ─────────────────────────────────────────────
// INTERNAL: nanosecond timestamp
// ─────────────────────────────────────────────

static uint64_t drift_now_ns(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000000000ULL + (uint64_t)ts.tv_nsec;
}

// ─────────────────────────────────────────────
// VECTOR UTILITIES
// Pure mathematics — no state, no side effects
// ─────────────────────────────────────────────

float vec3_magnitude(const Vector3* v) {
    return sqrtf(v->x*v->x + v->y*v->y + v->z*v->z);
}

Vector3 vec3_subtract(const Vector3* a, const Vector3* b) {
    return (Vector3){ a->x - b->x, a->y - b->y, a->z - b->z };
}

Vector3 vec3_add(const Vector3* a, const Vector3* b) {
    return (Vector3){ a->x + b->x, a->y + b->y, a->z + b->z };
}

Vector3 vec3_scale(const Vector3* v, float s) {
    return (Vector3){ v->x * s, v->y * s, v->z * s };
}

float vec3_dot(const Vector3* a, const Vector3* b) {
    return a->x*b->x + a->y*b->y + a->z*b->z;
}

float vec3_angle(const Vector3* a, const Vector3* b) {
    float mag_a = vec3_magnitude(a);
    float mag_b = vec3_magnitude(b);
    if (mag_a < 1e-9f || mag_b < 1e-9f) return 0.0f;
    float cos_theta = vec3_dot(a, b) / (mag_a * mag_b);
    // Clamp to [-1, 1] to prevent acos domain error
    if (cos_theta >  1.0f) cos_theta =  1.0f;
    if (cos_theta < -1.0f) cos_theta = -1.0f;
    return acosf(cos_theta);
}

// ─────────────────────────────────────────────
// CORE: V(t) = P(t) - C(t)
// "Relative observation vector"
// P = put point (destination)
// C = camera/drone current position
// ─────────────────────────────────────────────

Vector3 drift_compute_V(const Vector3* P, const Vector3* C) {
    return vec3_subtract(P, C);
}

// ─────────────────────────────────────────────
// CORE: W(t) = (2/3)*P + (1/3)*C
// "Weighted lattice intercept"
// "The drone does NOT fly to P or C.
//  It flies to the weighted average."
// "George: 2/3 forward, 1/3 back."
// ─────────────────────────────────────────────

Vector3 drift_compute_W(const Vector3* P, const Vector3* C) {
    Vector3 two_thirds_P = vec3_scale(P, 2.0f / 3.0f);
    Vector3 one_third_C  = vec3_scale(C, 1.0f / 3.0f);
    return vec3_add(&two_thirds_P, &one_third_C);
}

// ─────────────────────────────────────────────
// RADIAL DRIFT: Dr = d(|V|)/dt
// Finite difference approximation from two frames
// Dr < 0 = approach (P and C getting closer)
// Dr > 0 = retreat  (P and C moving apart)
// Dr = 0 = parallel (distance unchanged)
//
// From demo transcript:
//   "approaching approaching" → Dr < 0
//   "moving away moving away" → Dr > 0
//   "stuck" (orthogonal)     → Dr ≈ 0, Dω > 0
// ─────────────────────────────────────────────

float drift_compute_radial(float magnitude_now,
                            float magnitude_prev,
                            float dt) {
    if (dt < 1e-9f) return 0.0f;
    return (magnitude_now - magnitude_prev) / dt;
}

// ─────────────────────────────────────────────
// ANGULAR DRIFT: Dω = dθ/dt
// θ = angle between V(t) and V(t-Δt)
//
// "Moving at 45° = orthogonal drift"
// "If I move orthogonally it should say moving sideways"
// Non-zero Dω with Dr≈0 = pure lateral displacement
// Non-zero Dω with Dr>0 = red shift (angular retreat)
// ─────────────────────────────────────────────

float drift_compute_angular(const Vector3* V_now,
                             const Vector3* V_prev,
                             float dt) {
    if (dt < 1e-9f) return 0.0f;
    float theta = vec3_angle(V_now, V_prev);
    return theta / dt;
}

// ─────────────────────────────────────────────
// COLOR CLASSIFICATION
// Maps (Dr, Dω) to four observable states
// ─────────────────────────────────────────────

DriftColorState drift_classify(float Dr, float Dw,
                                float thr_approach,
                                float thr_retreat,
                                float thr_angular) {
    bool approaching = (Dr < -thr_approach);
    bool retreating  = (Dr >  thr_retreat);
    bool angular     = (Dw >  thr_angular);
    bool still       = (!approaching && !retreating && !angular);

    if (still)                     return DRIFT_COLOR_BLUE;    // no drift
    if (approaching && !angular)   return DRIFT_COLOR_GREEN;   // clean approach
    if (approaching &&  angular)   return DRIFT_COLOR_ORANGE;  // self-tracking mode
    if (retreating  ||  angular)   return DRIFT_COLOR_RED;     // drift / red shift
    return DRIFT_COLOR_BLUE;
}

// ─────────────────────────────────────────────
// RED SHIFT CHECK
// "Drift + angle = red shift"
// From transcript: moving at angle = drifting away
// Like Doppler: wavelength stretches as source retreats
// ─────────────────────────────────────────────

bool drift_is_redshift(const DriftObservation* obs, float angular_threshold) {
    return (obs->Dr > 0.0f) && (obs->Dw > angular_threshold);
}

// ─────────────────────────────────────────────
// SYMMETRIC INTERCEPT CHECK
// Discriminant Δ = b² - 4c
// Δ = 0 → drone is on exact intercept line
// "Symmetric axis — one root — drone on target"
// ─────────────────────────────────────────────

bool drift_is_symmetric(const DriftObservation* obs) {
    return obs->root == DRIFT_SYMMETRIC;
}

// ─────────────────────────────────────────────
// SELF-REFERENTIAL PROBE
// "The camera knows where it is in space and time."
// "It's tracking itself."
// Returns TRUE if observer can determine own position
// from the drift history (self-localization)
// ─────────────────────────────────────────────

bool drift_self_probe(const DriftContext* ctx) {
    if (!ctx->initialized) return false;
    if (ctx->frame_count < 2) return false;

    // Self-probe: if the drift vector is internally consistent
    // across the last 3 frames, the observer knows where it is
    if (ctx->history.count < 3) return false;

    int h = ctx->history.head;
    const DriftObservation* f0 = &ctx->history.frames[h % DRIFT_HISTORY_SIZE];
    const DriftObservation* f1 = &ctx->history.frames[(h - 1 + DRIFT_HISTORY_SIZE)
                                                        % DRIFT_HISTORY_SIZE];
    const DriftObservation* f2 = &ctx->history.frames[(h - 2 + DRIFT_HISTORY_SIZE)
                                                        % DRIFT_HISTORY_SIZE];

    // Consistency check: Dr sign should be stable across frames
    // (not oscillating — that would mean the observer is lost)
    int sign0 = (f0->Dr > 0) ? 1 : (f0->Dr < 0) ? -1 : 0;
    int sign1 = (f1->Dr > 0) ? 1 : (f1->Dr < 0) ? -1 : 0;
    int sign2 = (f2->Dr > 0) ? 1 : (f2->Dr < 0) ? -1 : 0;

    // If all three agree on direction → self-probe passes
    bool consistent = (sign0 == sign1) && (sign1 == sign2);
    return consistent;
}

// ─────────────────────────────────────────────
// HISTORY — rolling window push
// ─────────────────────────────────────────────

void drift_history_push(DriftHistory* hist, const DriftObservation* obs) {
    hist->head = (hist->head + 1) % DRIFT_HISTORY_SIZE;
    hist->frames[hist->head] = *obs;
    if (hist->count < DRIFT_HISTORY_SIZE) hist->count++;
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

DriftContext drift_init(float threshold_approach,
                         float threshold_retreat,
                         float threshold_angular) {
    DriftContext ctx;
    memset(&ctx, 0, sizeof(DriftContext));

    ctx.threshold_approach  = threshold_approach;
    ctx.threshold_retreat   = threshold_retreat;
    ctx.threshold_angular   = threshold_angular;
    ctx.initialized         = false;
    ctx.self_referential    = true;   // drift theorem is always self-referential
    ctx.frame_count         = 0;
    ctx.history.head        = 0;
    ctx.history.count       = 0;
    ctx.history.dt_avg_ms   = 0.0f;

    printf("[DRIFT] Context initialized.\n");
    printf("[DRIFT] Thresholds: approach=%.2f retreat=%.2f angular=%.4f rad/s\n",
           threshold_approach, threshold_retreat, threshold_angular);
    printf("[DRIFT] Self-referential: TRUE — observer tracks its own position.\n");

    return ctx;
}

// ─────────────────────────────────────────────
// FULL UPDATE — called every frame
// P = delivery destination (fixed or moving)
// C = drone current position (from sensor/GPS)
//
// This is the heart of the Drift Theorem.
// Every call produces one complete observation.
// ─────────────────────────────────────────────

DriftObservation drift_update(DriftContext* ctx,
                               const Vector3* P,
                               const Vector3* C) {
    DriftObservation obs;
    memset(&obs, 0, sizeof(DriftObservation));

    obs.timestamp_ns = drift_now_ns();
    obs.P = *P;
    obs.C = *C;

    // V(t) = P(t) - C(t)
    obs.V = drift_compute_V(P, C);
    obs.magnitude_V = vec3_magnitude(&obs.V);

    // W(t) = (2/3)*P + (1/3)*C
    obs.W = drift_compute_W(P, C);

    if (!ctx->initialized) {
        // First frame — no derivative yet
        obs.Dr     = 0.0f;
        obs.Dw     = 0.0f;
        obs.D      = (Vector3){0, 0, 0};
        obs.theta  = 0.0f;
        obs.magnitude_D = 0.0f;
        obs.color  = DRIFT_COLOR_BLUE;
        obs.root   = DRIFT_SYMMETRIC;
        ctx->previous   = obs;
        ctx->initialized = true;
    } else {
        // dt in seconds
        float dt = (float)(obs.timestamp_ns - ctx->previous.timestamp_ns) / 1e9f;
        if (dt < 1e-6f) dt = 1e-6f; // guard against zero dt

        // D(t) = dV/dt (finite difference)
        Vector3 dV = vec3_subtract(&obs.V, &ctx->previous.V);
        obs.D = vec3_scale(&dV, 1.0f / dt);
        obs.magnitude_D = vec3_magnitude(&obs.D);

        // Radial drift: Dr = d(|V|)/dt
        obs.Dr = drift_compute_radial(obs.magnitude_V,
                                       ctx->previous.magnitude_V,
                                       dt);

        // Angular drift: Dω = dθ/dt
        obs.theta = vec3_angle(&obs.V, &ctx->previous.V);
        obs.Dw    = drift_compute_angular(&obs.V, &ctx->previous.V, dt);

        // Drift angle in degrees
        obs.drift_angle_deg = obs.theta * (180.0f / (float)M_PI);

        // Bipartite discriminant from magnitude
        // b = Dr (radial coefficient), c = Dw (angular coefficient)
        float discriminant = (obs.Dr * obs.Dr) - (4.0f * obs.Dw);
        if      (discriminant > 1e-6f)   obs.root = DRIFT_ASYMMETRIC;
        else if (discriminant < -1e-6f)  obs.root = DRIFT_QUANTUM_SUPERPOSITION;
        else                             obs.root = DRIFT_SYMMETRIC;

        // Update rolling average dt
        ctx->history.dt_avg_ms = ctx->history.dt_avg_ms * 0.9f + (dt * 1000.0f) * 0.1f;
    }

    // Color classification
    obs.color = drift_classify(obs.Dr, obs.Dw,
                                ctx->threshold_approach,
                                ctx->threshold_retreat,
                                ctx->threshold_angular);

    // Push to history
    drift_history_push(&ctx->history, &obs);
    ctx->previous = obs;
    ctx->current  = obs;
    ctx->frame_count++;

    return obs;
}

// ─────────────────────────────────────────────
// CONVERT to DriftVector for packet / A* use
// ─────────────────────────────────────────────

DriftVector drift_to_packet_vector(const DriftObservation* obs) {
    DriftVector dv;
    memset(&dv, 0, sizeof(DriftVector));

    dv.P           = obs->P;
    dv.C           = obs->C;
    dv.DT          = obs->V;          // DT = V = P - C
    dv.intercept   = obs->W;          // W = (2/3)P + (1/3)C
    dv.drift_angle = obs->drift_angle_deg;
    dv.radial      = obs->Dr;
    dv.angular     = obs->Dw;
    dv.root_state  = obs->root;

    // Discriminant: b = Dr, c = Dw
    dv.discriminant = (obs->Dr * obs->Dr) - (4.0f * obs->Dw);

    return dv;
}

// ─────────────────────────────────────────────
// PRINT DIAGNOSTICS
// ─────────────────────────────────────────────

void drift_print(const DriftObservation* obs) {
    const char* color_names[] = { "GREEN", "ORANGE", "RED", "BLUE" };
    const char* root_names[]  = { "ASYMMETRIC", "SYMMETRIC", "SUPERPOSITION" };

    printf("[DRIFT] frame:\n");
    printf("  P       = (%.4f, %.4f, %.4f)\n", obs->P.x, obs->P.y, obs->P.z);
    printf("  C       = (%.4f, %.4f, %.4f)\n", obs->C.x, obs->C.y, obs->C.z);
    printf("  V=P-C   = (%.4f, %.4f, %.4f)  |V|=%.4f\n",
           obs->V.x, obs->V.y, obs->V.z, obs->magnitude_V);
    printf("  W(2/3P+1/3C) = (%.4f, %.4f, %.4f)\n",
           obs->W.x, obs->W.y, obs->W.z);
    printf("  Dr      = %.6f  (%s)\n",
           obs->Dr, obs->Dr < 0 ? "APPROACHING" :
                    obs->Dr > 0 ? "RETREATING"  : "PARALLEL");
    printf("  Dw      = %.6f rad/s  (%.2f deg)\n",
           obs->Dw, obs->drift_angle_deg);
    printf("  Color   = %s\n", color_names[obs->color]);
    printf("  Root    = %s\n", root_names[obs->root]);
    printf("  RedShift= %s\n", (obs->Dr > 0 && obs->Dw > 0.01f) ? "YES" : "NO");
}

// ============================================================
// END DRIFT_THEOREM.C
//
// "Everything in the universe has a drift."
// "Moving at an angle: that's called a drift."
// "The drift is the derivative. The derivative is the truth."
// "Rather the machine drift than the person suffer."
//
// OBINexus Computing — Nnamdi Michael Okpala
// ============================================================
