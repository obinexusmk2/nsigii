/*
 * nsigii.c —  NSIGII State Machine Implementation
 * OBINexus SDK | MMUKO OS Design and Technology LLC
 * Author: Nnamdi Michael Okpala
 */

#include "nsigii.h"
#include <math.h>
#include <string.h>
#include <stdio.h>

/* ─── State Labels ────────────────────────────────────────────────────────── */

const char *state_label(State state) {
    switch (state) {
        case STATE_IDLE:    return "IDLE (green)";
        case STATE_WARNING: return "WARNING (yellow)";
        case STATE_DANGER:  return "DANGER (red)";
        default:                 return "UNKNOWN";
    }
}

/* ─── Discriminant Probe ──────────────────────────────────────────────────── */

Probe probe_compute(double a, double b, double c) {
    Probe probe;
    probe.a = a;
    probe.b = b;
    probe.c = c;
    probe.discriminant = (b * b) - (4.0 * a * c);

    /*
     * Map discriminant to state:
     *   Δ < 0  → DANGER  (no real solutions, system has no exit path)
     *   Δ = 0  → IDLE    (one solution, stable equilibrium)
     *   Δ > 0  → WARNING (two solutions, system is drifting)
     *
     * Use epsilon for floating-point equality near zero.
     */
    const double epsilon = 1e-9;
    if (probe.discriminant < -epsilon) {
        probe.state = STATE_DANGER;
    } else if (probe.discriminant <= epsilon) {
        probe.state = STATE_IDLE;
    } else {
        probe.state = STATE_WARNING;
    }

    return probe;
}

/* ─── Graph ───────────────────────────────────────────────────────────────── */

void graph_init(Graph *g) {
    if (!g) return;
    memset(g, 0, sizeof(Graph));
    g->node_count = 0;
    g->edge_count = 0;
}

int graph_add_node(Graph *g, double x, double y, double weight) {
    if (!g || g->node_count >= GRAPH_MAX_NODES) return -1;

    uint32_t id = (uint32_t)g->node_count;
    g->nodes[id].id     = id;
    g->nodes[id].state  = STATE_IDLE;
    g->nodes[id].weight = weight;
    g->nodes[id].x      = x;
    g->nodes[id].y      = y;
    g->node_count++;

    return (int)id;
}

int graph_add_edge(Graph *g,
                         uint32_t from, uint32_t to, double weight) {
    if (!g) return -1;
    if (from >= g->node_count || to >= g->node_count) return -1;
    if (g->edge_count >= GRAPH_MAX_EDGES) return -1;

    size_t i = g->edge_count;
    g->edge_from[i]   = from;
    g->edge_to[i]     = to;
    g->edge_weight[i] = weight;
    g->edge_count++;

    return 0;
}

void graph_set_state(Graph *g, uint32_t node_id, State state) {
    if (!g || node_id >= g->node_count) return;
    g->nodes[node_id].state = state;
}

void graph_count_states(const Graph *g,
                               size_t *idle,
                               size_t *warning,
                               size_t *danger) {
    if (!g) return;
    if (idle)    *idle    = 0;
    if (warning) *warning = 0;
    if (danger)  *danger  = 0;

    for (size_t i = 0; i < g->node_count; i++) {
        switch (g->nodes[i].state) {
            case STATE_IDLE:    if (idle)    (*idle)++;    break;
            case STATE_WARNING: if (warning) (*warning)++; break;
            case STATE_DANGER:  if (danger)  (*danger)++;  break;
            default: break;
        }
    }
}

/* ─── BTVDC ───────────────────────────────────────────────────────────────── */

BTVDC btvdc_compute(double vx, double vy, double cx, double cy) {
    BTVDC result;
    result.vx    = vx;
    result.vy    = vy;
    result.cx    = cx;
    result.cy    = cy;

    /*
     * BTVDC(G) = V(E) - C(E+)
     * Computed as Euclidean magnitude of the vector from centre to target,
     * signed by whether the target is ahead (+) or behind (-) the centre.
     */
    double dx    = vx - cx;
    double dy    = vy - cy;
    result.btvdc = sqrt(dx * dx + dy * dy);

    /* Sign: positive if target is further from origin than centre */
    double dist_v = sqrt(vx * vx + vy * vy);
    double dist_c = sqrt(cx * cx + cy * cy);
    if (dist_v < dist_c) {
        result.btvdc = -result.btvdc;
    }

    return result;
}

/* ─── Distance Metrics ────────────────────────────────────────────────────── */

double distance_manhattan(double x1, double y1, double x2, double y2) {
    return fabs(x1 - x2) + fabs(y1 - y2);
}

double distance_euclidean(double x1, double y1, double x2, double y2) {
    double dx = x1 - x2;
    double dy = y1 - y2;
    return sqrt(dx * dx + dy * dy);
}

/* ─── Engine Model (A) ────────────────────────────────────────────────────── */

const char *phase_label(Phase phase) {
    switch (phase) {
        case PHASE_CREATE:  return "CREATE";
        case PHASE_BUILD:   return "BUILD";
        case PHASE_REPAIR:  return "REPAIR";
        case PHASE_DESTROY: return "DESTROY";
        default:                 return "UNKNOWN";
    }
}

Phase phase_next(Phase current, State system_state) {
    /*
     * Engine Model (A) transition rules:
     *
     *   If system is IDLE (green):
     *     CREATE → BUILD → (cycle back to CREATE via REPAIR)
     *
     *   If system is WARNING (yellow):
     *     Any phase → REPAIR → BUILD
     *
     *   If system is DANGER (red):
     *     Any phase → DESTROY
     */
    switch (system_state) {
        case STATE_DANGER:
            return PHASE_DESTROY;

        case STATE_WARNING:
            if (current == PHASE_REPAIR) return PHASE_BUILD;
            return PHASE_REPAIR;

        case STATE_IDLE:
        default:
            switch (current) {
                case PHASE_CREATE:  return PHASE_BUILD;
                case PHASE_BUILD:   return PHASE_CREATE;
                case PHASE_REPAIR:  return PHASE_BUILD;
                case PHASE_DESTROY: return PHASE_CREATE;
                default:                 return PHASE_CREATE;
            }
    }
}

/* ─── Welfare Metric ──────────────────────────────────────────────────────── */

double welfare(double t, double C, double P) {
    /* W = (1-t) * C + t * P */
    if (t < 0.0) t = 0.0;
    if (t > 1.0) t = 1.0;
    return ((1.0 - t) * C) + (t * P);
}