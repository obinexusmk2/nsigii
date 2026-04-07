/**
 * nsigii.h —  NSIGII State Machine
 * OBINexus SDK | MMUKO OS Design and Technology LLC
 * Author: Nnamdi Michael Okpala
 *
 * NSIGII: Non-Static Iterative Graph Intelligence Interface
 *
 * Implements the tricolour graph state machine from the MMUKO Boot Sequence.
 * State transitions are governed by the discriminant probe (b²-4ac) and
 * the BTVDC formula: BTVDC(G) = V(E) - C(E+)
 *
 * Colour map:
 *   GREEN  (idle)    — b²-4ac = 0  — equilibrium, no action needed
 *   YELLOW (warning) — b²-4ac > 0  — two solutions exist, system drifting
 *   RED    (danger)  — b²-4ac < 0  — no solution, intervention required
 */

#ifndef NSIGII_H
#define NSIGII_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ─── Version ─────────────────────────────────────────────────────────────── */

#define NSIGII_VERSION_MAJOR 0
#define NSIGII_VERSION_MINOR 1
#define NSIGII_VERSION_PATCH 0

/* ─── State ───────────────────────────────────────────────────────────────── */

typedef enum {
    STATE_IDLE    = 0,   /* GREEN  — equilibrium                        */
    STATE_WARNING = 1,   /* YELLOW — drift detected, monitor            */
    STATE_DANGER  = 2,   /* RED    — critical, no solution path         */
    STATE_UNKNOWN = 3    /* uninitialised or invalid                    */
} State;

/* Human-readable state label */
const char *_state_label(State state);

/* ─── Discriminant Probe ──────────────────────────────────────────────────── */
/*
 * The probe models system transition viability using the quadratic discriminant.
 * Given coefficients a, b, c from the signal equation:
 *
 *   probe_exit(Δt) : |Δt|² → State
 *   b² - 4ac  ≥ 0
 *
 * Δ > 0  → two real solutions  → YELLOW (warning, two paths possible)
 * Δ = 0  → one real solution   → GREEN  (idle, single stable path)
 * Δ < 0  → no real solution    → RED    (danger, no viable transition)
 */

typedef struct {
    double a;
    double b;
    double c;
    double discriminant;  /* computed: b*b - 4*a*c */
    State state;      /* computed state from discriminant */
} Probe;

/* Compute probe: fills discriminant and state fields */
Probe _probe_compute(double a, double b, double c);

/* ─── Graph Node ──────────────────────────────────────────────────────────── */

typedef struct {
    uint32_t  id;
    State state;
    double    weight;     /* edge weight in the MMUKO boot sequence */
    double    x;          /* position for distance metrics           */
    double    y;
} Node;

/* ─── Graph G = (A, V, W) ─────────────────────────────────────────────────── */
/*
 * Tricolour graph as defined in the NSIGII specification:
 *   A = adjacency set
 *   V = vertex set
 *   W = weight set
 */

#define GRAPH_MAX_NODES 256
#define GRAPH_MAX_EDGES 1024

typedef struct {
    Node  nodes[GRAPH_MAX_NODES];
    uint32_t  edge_from[GRAPH_MAX_EDGES];
    uint32_t  edge_to[GRAPH_MAX_EDGES];
    double    edge_weight[GRAPH_MAX_EDGES];
    size_t    node_count;
    size_t    edge_count;
} Graph;

/* Initialise an empty graph */
void     _graph_init(Graph *g);

/* Add a node; returns node id, or -1 on failure */
int      _graph_add_node(Graph *g, double x, double y, double weight);

/* Add a directed edge; returns 0 on success */
int      _graph_add_edge(Graph *g,
                              uint32_t from, uint32_t to, double weight);

/* Set the state of a node */
void     _graph_set_state(Graph *g, uint32_t node_id, State state);

/* Count nodes in each state */
void     _graph_count_states(const Graph *g,
                                  size_t *idle,
                                  size_t *warning,
                                  size_t *danger);

/* ─── BTVDC Formula ───────────────────────────────────────────────────────── */
/*
 * BTVDC(G) = V(E) - C(E+)
 * where V is the target (vertex) point and C is the centre point.
 * Returns the signed drift value between target and centre.
 */

typedef struct {
    double vx, vy;   /* target point V(E)  */
    double cx, cy;   /* centre point C(E+) */
    double btvdc;    /* computed result    */
} BTVDC;

BTVDC _btvdc_compute(double vx, double vy, double cx, double cy);

/* ─── Distance Metrics ────────────────────────────────────────────────────── */

/* Manhattan distance: |x1-x2| + |y1-y2| */
double _distance_manhattan(double x1, double y1, double x2, double y2);

/* Euclidean distance: sqrt((x1-x2)² + (y1-y2)²) */
double _distance_euclidean(double x1, double y1, double x2, double y2);

/* ─── Engine Model (A) ────────────────────────────────────────────────────── */
/*
 * The Engine Model governs the MMUKO component lifecycle:
 *
 *        create/destroy
 *           /       \
 *     repair/renew ←→ build/create
 *
 * A component always has a lifecycle phase and a state.
 */

typedef enum {
    PHASE_CREATE  = 0,
    PHASE_BUILD   = 1,
    PHASE_REPAIR  = 2,
    PHASE_DESTROY = 3
} Phase;

typedef struct {
    Phase phase;
    State state;
    uint32_t  component_id;
    char      name[64];
} Component;

/* Transition a component to the next phase */
Phase _phase_next(Phase current, State system_state);

/* Human-readable phase label */
const char *_phase_label(Phase phase);

/* ─── Welfare Metric W = (1-t)C + tP ─────────────────────────────────────── */
/*
 * Welfare metric as defined in the OBINexus notebook:
 *   W = (1-t) * C + t * P
 *   where t is time coefficient (0..1),
 *         C is institutional cost,
 *         P is personal/payload cost.
 * Returns the weighted welfare value.
 */
double _welfare(double t, double C, double P);

#ifdef __cplusplus
}
#endif

#endif /* NSIGII_H */