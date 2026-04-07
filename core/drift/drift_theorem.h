#ifndef DRIFT_THEOREM_H
#define DRIFT_THEOREM_H

// ============================================================
// DRIFT_THEOREM.H — Self-Referential Spatial Observer
// OBINexus Computing — Nnamdi Michael Okpala
// Source: Drift Theorem formal spec + OpenCV live demo transcript
// ============================================================
//
// THEOREM STATEMENT:
//   "In a spatial observation system, the motion of a tracked
//    object relative to the observer can be completely
//    characterised by the time derivative of the relative
//    observation vector, producing radial and angular drift
//    components that describe separation, approach, and lateral
//    displacement within the observation frame."
//
// CORE EQUATIONS:
//   V(t) = P(t) - C(t)          relative observation vector
//   D(t) = dV(t)/dt             drift vector (time derivative)
//   Dr   = d(|V(t)|)/dt         radial drift  (<0=approach, >0=retreat)
//   Dω   = dθ/dt                angular drift (lateral displacement rate)
//   W(t) = (2/3)*P + (1/3)*C   weighted intercept (drone navigate-to)
//
// FOUR DRIFT STATES (from live OpenCV demo):
//   RED    = drift detected       (moving away, angular)
//   BLUE   = neutral baseline     (no drift, still)
//   GREEN  = verified approach    (ZKP confirmed, Dr < 0)
//   ORANGE = self-tracking mode   (camera tracking its own position)
//
// SELF-REFERENTIAL PROPERTY:
//   "It's tracking itself."
//   The camera knows where it is in space and time.
//   It measures its own drift FROM the target.
//   No machine learning — pure vector mathematics.
//
// BUFFON UNIVERSE CONNECTION:
//   The needle (drone) drops through space.
//   Space is already there (Buffon universe).
//   Drift measures how the needle moves through time.
// ============================================================

#include <stdint.h>
#include <stdbool.h>
#include "../packet/nsigii_packet.h"

// ─────────────────────────────────────────────
// DRIFT COLOR STATE (from OpenCV demo)
// Four states of motion classification
// ─────────────────────────────────────────────

typedef enum {
    DRIFT_COLOR_GREEN  = 0,  // verified approach — Dr < 0, ZKP confirmed
    DRIFT_COLOR_ORANGE = 1,  // self-tracking — camera on own position
    DRIFT_COLOR_RED    = 2,  // drift detected — moving away / angular
    DRIFT_COLOR_BLUE   = 3   // neutral baseline — no significant drift
} DriftColorState;

// ─────────────────────────────────────────────
// DRIFT OBSERVATION — one measurement frame
// Computed every tick from drone position
// ─────────────────────────────────────────────

typedef struct {
    Vector3  P;              // put point — delivery destination
    Vector3  C;              // camera/drone current position
    Vector3  V;              // V = P - C (relative observation vector)
    Vector3  D;              // D = dV/dt (drift vector)
    Vector3  W;              // W = (2/3)*P + (1/3)*C (weighted intercept)
    float    magnitude_V;    // |V(t)| — observer-object distance
    float    magnitude_D;    // |D(t)| — drift speed
    float    Dr;             // radial drift = d(|V|)/dt
    float    Dw;             // angular drift = dθ/dt (omega)
    float    theta;          // angle between successive V vectors
    float    drift_angle_deg; // drift angle in degrees from heading
    DriftColorState color;   // RED/BLUE/GREEN/ORANGE classification
    DriftRootState  root;    // ASYMMETRIC/SYMMETRIC/QUANTUM_SUPERPOSITION
    uint64_t timestamp_ns;   // when this observation was taken
} DriftObservation;

// ─────────────────────────────────────────────
// DRIFT HISTORY — rolling window of observations
// Used to compute derivatives (dV/dt)
// ─────────────────────────────────────────────

#define DRIFT_HISTORY_SIZE 16

typedef struct {
    DriftObservation frames[DRIFT_HISTORY_SIZE];
    int              head;       // index of most recent frame
    int              count;      // how many frames filled
    float            dt_avg_ms;  // average time between frames
} DriftHistory;

// ─────────────────────────────────────────────
// DRIFT CONTEXT — full theorem state
// ─────────────────────────────────────────────

typedef struct {
    DriftHistory     history;
    DriftObservation current;    // latest computed observation
    DriftObservation previous;   // frame before current
    bool             initialized;
    float            threshold_approach; // Dr < -threshold → GREEN
    float            threshold_retreat;  // Dr >  threshold → RED
    float            threshold_angular;  // Dω > threshold  → lateral
    // Self-referential flag (from demo: "it's tracking itself")
    bool             self_referential;   // TRUE = drone is its own reference
    uint64_t         frame_count;        // total frames processed
} DriftContext;

// ─────────────────────────────────────────────
// FUNCTION DECLARATIONS
// ─────────────────────────────────────────────

// Initialize drift context
DriftContext drift_init(float threshold_approach,
                         float threshold_retreat,
                         float threshold_angular);

// Core computation: V(t) = P(t) - C(t)
Vector3 drift_compute_V(const Vector3* P, const Vector3* C);

// Weighted intercept: W(t) = (2/3)*P + (1/3)*C
// "The drone does NOT fly to P or C — it flies to W"
Vector3 drift_compute_W(const Vector3* P, const Vector3* C);

// Radial drift: Dr = d(|V|)/dt
// Dr < 0 = approach, Dr > 0 = retreat, Dr = 0 = parallel
float drift_compute_radial(float magnitude_now, float magnitude_prev, float dt);

// Angular drift: Dω = dθ/dt
// θ = angle between V(t) and V(t-Δt)
float drift_compute_angular(const Vector3* V_now, const Vector3* V_prev, float dt);

// Classify color state from Dr and Dω
DriftColorState drift_classify(float Dr, float Dw,
                                float thr_approach,
                                float thr_retreat,
                                float thr_angular);

// Full observation update — call every frame
// P = delivery destination, C = drone current position
DriftObservation drift_update(DriftContext* ctx, const Vector3* P, const Vector3* C);

// Push observation into rolling history
void drift_history_push(DriftHistory* hist, const DriftObservation* obs);

// Get drift vector for use in A* and loopback
DriftVector drift_to_packet_vector(const DriftObservation* obs);

// Red shift check: is the drone drifting away at angle?
// "Drift + angle = red shift" (from demo transcript)
bool drift_is_redshift(const DriftObservation* obs, float angular_threshold);

// Is drone on exact symmetric intercept? (discriminant = 0)
bool drift_is_symmetric(const DriftObservation* obs);

// Self-referential probe: "does the system know where it is?"
// Returns true if the observer can determine its own position
bool drift_self_probe(const DriftContext* ctx);

// Print current drift state (diagnostics)
void drift_print(const DriftObservation* obs);

// Vector utilities
float vec3_magnitude(const Vector3* v);
Vector3 vec3_subtract(const Vector3* a, const Vector3* b);
Vector3 vec3_scale(const Vector3* v, float s);
Vector3 vec3_add(const Vector3* a, const Vector3* b);
float vec3_dot(const Vector3* a, const Vector3* b);
float vec3_angle(const Vector3* a, const Vector3* b);

#endif // DRIFT_THEOREM_H

// ============================================================
// END DRIFT_THEOREM.H
// "The drift is the derivative. The derivative is the truth."
// "Everything in the universe has a drift."
// OBINexus Computing — Nnamdi Michael Okpala
// ============================================================
