// ============================================================
// ASTAR_TRIPOLAR.C — A* Routing with Tripolar Heuristic
// OBINexus Computing — Nnamdi Michael Okpala
// ============================================================
//
// CONSTITUTIONAL ROUTING LAW:
//   "NSIGII: Provide Food, Water and Shelter
//    in Space, Given Time, via Shortest Path Routing"
//
// FILTER before FLASH (from Filter-Flash_CISCO spec):
//   Filter = pure functor — mutates DATA, preserves STATE
//   Flash  = commit — irreversible write to delivery path
//   A node that fails FILTER never enters OPEN list.
//   A path that fails consensus never reaches FLASH.
//
// TRIPOLAR HEURISTIC:
//   f(n) = α(n) + γ(n)
//   α(n) = g_cost (actual path cost, standard A*)
//   γ(n) = h_HERE_AND_NOW   (Euclidean distance)
//         + h_WHEN_AND_WHERE (time-adjusted by drift)
//         + h_THERE_AND_THEN (history score)
//
// SUFFERING REDUCTION GUARANTEE (Phase 16):
//   Path selection minimises f(n) which minimises
//   time-to-delivery which minimises Σ = (N-R)*K
//   The shortest path IS the suffering reducer.
// ============================================================

#include "astar_tripolar.h"
#include <math.h>
#include <string.h>
#include <stdio.h>
#include <float.h>

// ─────────────────────────────────────────────
// INTERNAL UTILITIES
// ─────────────────────────────────────────────

static float vec3_distance(const Vector3* a, const Vector3* b) {
    float dx = a->x - b->x;
    float dy = a->y - b->y;
    float dz = a->z - b->z;
    return sqrtf(dx*dx + dy*dy + dz*dz);
}

// Open list: min-heap by f_cost
// Simple linear scan for prototype — replace with heap for production
static int open_list_pop_min(AStarContext* ctx) {
    if (ctx->open_count == 0) return -1;

    int   best_idx  = 0;
    float best_cost = ctx->nodes[ctx->open_list[0]].f_cost;

    for (int i = 1; i < ctx->open_count; i++) {
        float fc = ctx->nodes[ctx->open_list[i]].f_cost;
        if (fc < best_cost) {
            best_cost = fc;
            best_idx  = i;
        }
    }

    int node_id = ctx->open_list[best_idx];
    // Remove from open list
    ctx->open_list[best_idx] = ctx->open_list[--ctx->open_count];
    return node_id;
}

static void open_list_push(AStarContext* ctx, int node_id) {
    if (ctx->open_count >= ASTAR_MAX_OPEN) return;
    ctx->open_list[ctx->open_count++] = node_id;
    ctx->nodes[node_id].in_open = true;
}

// ─────────────────────────────────────────────
// TRIPOLAR HEURISTIC COMPONENTS
//
// HERE_AND_NOW:  current Euclidean distance
//   bit0 of consensus — are we close? (Dr < 0 = approaching)
//
// WHEN_AND_WHERE: time-adjusted distance
//   bit1 of consensus — will we arrive in time?
//   Buffon universe: time is linear, space is free
//   Adjusted by radial drift (approaching reduces estimate)
//
// THERE_AND_THEN: historical delivery score [0,1]
//   bit2 of consensus — has this location received before?
//   0.0 = never delivered (unknown territory)
//   1.0 = fully verified delivery history
// ─────────────────────────────────────────────

float h_here_and_now(const Vector3* a, const Vector3* b) {
    // Raw Euclidean distance — spatial component
    // Maps to HERE_AND_NOW pole (bit0)
    return vec3_distance(a, b);
}

float h_when_and_where(const Vector3* a, const Vector3* b, float drift_radial) {
    // Time-adjusted distance
    // drift_radial < 0 = drone approaching = time shrinks
    // drift_radial > 0 = drone retreating = time grows
    // Maps to WHEN_AND_WHERE pole (bit1)
    float base_distance = vec3_distance(a, b);

    // Drift correction: approaching reduces estimated time
    // Dr < 0 means closing in — adjust by (1 + Dr) clipped to [0.1, 2.0]
    float correction = 1.0f + drift_radial;
    if (correction < 0.1f) correction = 0.1f;
    if (correction > 2.0f) correction = 2.0f;

    return base_distance * correction;
}

float h_there_and_then(float history_score) {
    // Historical delivery penalty
    // Perfect history (1.0) = 0 added cost
    // Unknown territory (0.0) = full base penalty
    // Maps to THERE_AND_THEN pole (bit2)
    // history_score in [0.0, 1.0]
    float penalty = 1.0f - history_score;
    return penalty * 10.0f; // scale to meaningful cost units
}

// ─────────────────────────────────────────────
// TRIPOLAR HEURISTIC — COMBINED
// γ(n) = w_here  * h_HERE_AND_NOW
//       + w_when  * h_WHEN_AND_WHERE
//       + w_there * h_THERE_AND_THEN
// ─────────────────────────────────────────────

float astar_heuristic(const AStarNode*      node,
                      const AStarNode*      goal,
                      const TripolarWeights* w,
                      float                  delivery_history_score) {
    float h_here  = h_here_and_now(&node->position, &goal->position);
    float h_when  = h_when_and_where(&node->position, &goal->position,
                                      0.0f); // drift injected via update
    float h_there = h_there_and_then(delivery_history_score);

    return (w->w_here  * h_here)
         + (w->w_when  * h_when)
         + (w->w_there * h_there);
}

// ─────────────────────────────────────────────
// FILTER FUNCTOR (from Filter-Flash_CISCO spec)
// Pure function — data only, no state mutation
// ASSERT: is_pure == TRUE, state_safe == TRUE
//
// A node passes FILTER if:
//   1. Not an obstacle
//   2. Not already closed
//   3. Local consensus is not fully NO (0b000)
//   4. Resource type is a constitutional need
// ─────────────────────────────────────────────

bool astar_filter_node(const AStarNode* node, const NSIGII_Packet* pkt) {
    // Constitutional check 1: not a physical obstacle
    if (node->is_obstacle) {
        return false;
    }

    // Constitutional check 2: not already evaluated
    if (node->in_closed) {
        return false;
    }

    // Constitutional check 3: local consensus not fully blocked
    // CONSENSUS_NO (0b000) = all poles rejected this node
    if (node->local_consensus == CONSENSUS_NO) {
        return false;
    }

    // Constitutional check 4: packet carries a real need
    // ResourceType must be a Maslow Tier 1 physiological need
    if (pkt->resource > RESOURCE_REST) {
        return false;
    }

    // Constitutional check 5: delivery not already complete
    if (pkt->is_complete) {
        return false;
    }

    // FILTER PASSED — pure, no state mutation occurred
    return true;
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

AStarContext astar_init(TripolarWeights weights) {
    AStarContext ctx;
    memset(&ctx, 0, sizeof(AStarContext));
    ctx.weights         = weights;
    ctx.start_id        = -1;
    ctx.goal_id         = -1;
    ctx.path_found      = false;
    ctx.filter_passed   = false;
    ctx.flash_committed = false;
    ctx.path_length     = 0;
    ctx.total_cost      = 0.0f;

    // Initialize all nodes
    for (int i = 0; i < ASTAR_MAX_NODES; i++) {
        ctx.nodes[i].id             = i;
        ctx.nodes[i].g_cost         = FLT_MAX;
        ctx.nodes[i].h_cost         = 0.0f;
        ctx.nodes[i].f_cost         = FLT_MAX;
        ctx.nodes[i].parent_id      = -1;
        ctx.nodes[i].in_open        = false;
        ctx.nodes[i].in_closed      = false;
        ctx.nodes[i].is_obstacle    = false;
        ctx.nodes[i].local_consensus = CONSENSUS_NO;
    }

    printf("[ASTAR] Context initialized. Weights: here=%.2f when=%.2f there=%.2f\n",
           weights.w_here, weights.w_when, weights.w_there);
    return ctx;
}

int astar_add_node(AStarContext* ctx, Vector3 position, bool is_obstacle) {
    if (ctx->node_count >= ASTAR_MAX_NODES) {
        printf("[ASTAR] ERROR: node limit reached (%d)\n", ASTAR_MAX_NODES);
        return -1;
    }
    int id = ctx->node_count++;
    ctx->nodes[id].position    = position;
    ctx->nodes[id].is_obstacle = is_obstacle;
    // Default: all poles undecided — HERE_AND_NOW votes YES by default
    ctx->nodes[id].local_consensus = CONSENSUS_MAYBE_HERE_AND_NOW;
    return id;
}

void astar_set_endpoints(AStarContext* ctx, int start_id, int goal_id) {
    ctx->start_id = start_id;
    ctx->goal_id  = goal_id;
    printf("[ASTAR] Start=%d Goal=%d\n", start_id, goal_id);
}

// ─────────────────────────────────────────────
// DRIFT UPDATE
// Inject real-time drift measurement into node costs
// Called each time the drone reports its position
// Dr < 0 = approaching = reduce h_when costs near goal
// ─────────────────────────────────────────────

void astar_update_drift(AStarContext* ctx, const DriftVector* drift) {
    if (!drift) return;

    // Update goal node cost based on radial drift
    // Approaching (Dr < 0) → reduce h_when at goal
    if (ctx->goal_id >= 0) {
        AStarNode* goal = &ctx->nodes[ctx->goal_id];
        float dr = drift->radial;

        // Recalculate goal's h_cost with live drift
        float h_here  = h_here_and_now(&drift->C, &goal->position);
        float h_when  = h_when_and_where(&drift->C, &goal->position, dr);
        float h_there = h_there_and_then(0.5f); // default history

        goal->h_cost = (ctx->weights.w_here  * h_here)
                     + (ctx->weights.w_when  * h_when)
                     + (ctx->weights.w_there * h_there);

        // Update consensus at goal based on drift state
        if (dr < 0.0f) {
            // Approaching — HERE_AND_NOW pole votes YES
            goal->local_consensus = (Consensus)(goal->local_consensus | 0b001);
        }
        if (drift->root_state == DRIFT_SYMMETRIC) {
            // Exact intercept — WHEN_AND_WHERE pole votes YES
            goal->local_consensus = (Consensus)(goal->local_consensus | 0b010);
        }
    }

    printf("[ASTAR] Drift updated: Dr=%.4f Dω=%.4f root_state=%d\n",
           drift->radial, drift->angular, drift->root_state);
}

// ─────────────────────────────────────────────
// CONSENSUS GATE
// Path may only FLASH when all three poles agree
// 0b111 = CONSENSUS_YES = constitutional clearance
// ─────────────────────────────────────────────

bool astar_consensus_gate(const AStarContext* ctx) {
    if (!ctx->path_found) return false;

    // Walk the committed path
    // Every node on path must have consensus >= MAYBE (not NO)
    // Goal node must reach CONSENSUS_YES (0b111)
    for (int i = 0; i < ctx->path_length; i++) {
        int nid = ctx->path[i];
        if (ctx->nodes[nid].local_consensus == CONSENSUS_NO) {
            printf("[ASTAR] CONSENSUS GATE: node %d blocked (0b000)\n", nid);
            return false;
        }
    }

    // Check goal node has full YES
    if (ctx->goal_id >= 0) {
        Consensus goal_c = ctx->nodes[ctx->goal_id].local_consensus;
        if (goal_c != CONSENSUS_YES) {
            printf("[ASTAR] CONSENSUS GATE: goal node not YES (0b%d%d%d)\n",
                   (goal_c >> 2) & 1, (goal_c >> 1) & 1, goal_c & 1);
            return false;
        }
    }

    printf("[ASTAR] CONSENSUS GATE: PASSED — 0b111 confirmed\n");
    return true;
}

// ─────────────────────────────────────────────
// FLASH — Commit path to delivery
// Irreversible. Constitutional. No rollback.
// "Flash is the write-to-silicon event."
// ─────────────────────────────────────────────

bool astar_flash(AStarContext* ctx) {
    // FILTER must have passed before FLASH
    if (!ctx->filter_passed) {
        printf("[ASTAR] FLASH BLOCKED: FILTER not passed\n");
        return false;
    }

    // Consensus gate must be open
    if (!astar_consensus_gate(ctx)) {
        printf("[ASTAR] FLASH BLOCKED: consensus gate not open\n");
        return false;
    }

    // Path must exist
    if (!ctx->path_found || ctx->path_length == 0) {
        printf("[ASTAR] FLASH BLOCKED: no path found\n");
        return false;
    }

    // FLASH: commit — irreversible
    ctx->flash_committed = true;
    printf("[ASTAR] FLASH COMMITTED — path locked. %d waypoints. Cost=%.4f\n",
           ctx->path_length, ctx->total_cost);
    printf("[ASTAR] Rather the machine compute than the person suffer.\n");
    return true;
}

// ─────────────────────────────────────────────
// PATH RECONSTRUCTION
// Walk parent pointers from goal back to start
// ─────────────────────────────────────────────

int astar_reconstruct_path(AStarContext* ctx, int goal_id) {
    int  path_temp[ASTAR_MAX_PATH];
    int  len   = 0;
    int  curr  = goal_id;

    while (curr != -1 && len < ASTAR_MAX_PATH) {
        path_temp[len++] = curr;
        curr = ctx->nodes[curr].parent_id;
    }

    // Reverse: start → goal
    ctx->path_length = len;
    for (int i = 0; i < len; i++) {
        ctx->path[i] = path_temp[len - 1 - i];
    }

    ctx->total_cost = ctx->nodes[goal_id].g_cost;
    return len;
}

// ─────────────────────────────────────────────
// MAIN A* SEARCH
// PENDING → LOADED → FILTER → (search) → FLASH
// ─────────────────────────────────────────────

bool astar_search(AStarContext* ctx, const NSIGII_Packet* pkt) {
    if (ctx->start_id < 0 || ctx->goal_id < 0) {
        printf("[ASTAR] ERROR: endpoints not set\n");
        return false;
    }

    printf("[ASTAR] Search start. PKT resource=%d frame=%d\n",
           pkt->resource, pkt->frame);

    // Initialize start node
    AStarNode* start = &ctx->nodes[ctx->start_id];
    start->g_cost    = 0.0f;
    start->h_cost    = astar_heuristic(start,
                                        &ctx->nodes[ctx->goal_id],
                                        &ctx->weights,
                                        0.5f);
    start->f_cost    = start->g_cost + start->h_cost;
    start->parent_id = -1;

    // FILTER: start node must pass constitutional check
    if (!astar_filter_node(start, pkt)) {
        printf("[ASTAR] FILTER: start node failed constitutional check\n");
        return false;
    }

    open_list_push(ctx, ctx->start_id);
    ctx->filter_passed = false;

    // A* main loop
    while (ctx->open_count > 0) {
        int curr_id = open_list_pop_min(ctx);
        if (curr_id < 0) break;

        AStarNode* curr = &ctx->nodes[curr_id];
        curr->in_open   = false;
        curr->in_closed = true;

        // Goal reached
        if (curr_id == ctx->goal_id) {
            astar_reconstruct_path(ctx, curr_id);
            ctx->path_found    = true;
            ctx->filter_passed = true; // FILTER complete

            printf("[ASTAR] PATH FOUND — %d nodes, cost=%.4f\n",
                   ctx->path_length, ctx->total_cost);
            printf("[ASTAR] FILTER PASSED — constitutional verification complete\n");

            // Print tripolar breakdown at goal
            AStarNode* goal = &ctx->nodes[ctx->goal_id];
            printf("[ASTAR] Goal heuristics:\n");
            printf("         h_HERE_AND_NOW   = %.4f\n",
                   ctx->weights.w_here * h_here_and_now(
                       &curr->position, &goal->position));
            printf("         h_WHEN_AND_WHERE = %.4f\n",
                   ctx->weights.w_when * h_when_and_where(
                       &curr->position, &goal->position, 0.0f));
            printf("         h_THERE_AND_THEN = %.4f\n",
                   ctx->weights.w_there * h_there_and_then(0.5f));
            printf("         f(n) total       = %.4f\n", goal->f_cost);

            return true;
        }

        // Expand neighbours (4-connected + diagonal in 3D)
        // For drone delivery: scan all non-closed, non-obstacle nodes
        // within movement radius (simplified: all adjacent nodes)
        for (int n_id = 0; n_id < ctx->node_count; n_id++) {
            AStarNode* neighbour = &ctx->nodes[n_id];

            // FILTER: constitutional gate before expanding
            if (!astar_filter_node(neighbour, pkt)) {
                continue;
            }

            // Compute movement cost (Euclidean in 3D space)
            float move_cost = vec3_distance(&curr->position,
                                             &neighbour->position);

            // Skip unreachable (infinite distance = disconnected)
            if (move_cost > 50.0f) continue; // 50m max step for drone

            float tentative_g = curr->g_cost + move_cost;

            if (tentative_g < neighbour->g_cost) {
                // Better path found to this neighbour
                neighbour->parent_id = curr_id;
                neighbour->g_cost    = tentative_g;
                neighbour->h_cost    = astar_heuristic(
                    neighbour,
                    &ctx->nodes[ctx->goal_id],
                    &ctx->weights,
                    0.5f  // history score — injected from delivery records
                );
                neighbour->f_cost = neighbour->g_cost + neighbour->h_cost;

                // Update consensus at this neighbour
                // If we can reach it, HERE_AND_NOW votes YES
                neighbour->local_consensus = (Consensus)(
                    neighbour->local_consensus | 0b001
                );

                if (!neighbour->in_open) {
                    open_list_push(ctx, n_id);
                }
            }
        }
    }

    printf("[ASTAR] NO PATH FOUND — delivery blocked\n");
    return false;
}

// ─────────────────────────────────────────────
// GET NEXT WAYPOINT
// Called by DroneController on each navigation tick
// ─────────────────────────────────────────────

Vector3 astar_next_waypoint(const AStarContext* ctx, int step) {
    Vector3 zero = {0.0f, 0.0f, 0.0f};
    if (!ctx->flash_committed) return zero;
    if (step < 0 || step >= ctx->path_length) return zero;
    return ctx->nodes[ctx->path[step]].position;
}

// ============================================================
// END ASTAR_TRIPOLAR.C
// "Shortest path = minimum suffering = constitutional delivery"
// "Filter before Flash. Always."
// OBINexus Computing — Nnamdi Michael Okpala
// ============================================================
