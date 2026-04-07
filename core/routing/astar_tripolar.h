#ifndef ASTAR_TRIPOLAR_H
#define ASTAR_TRIPOLAR_H

// ============================================================
// ASTAR_TRIPOLAR.H — A* Routing with Tripolar Heuristic
// OBINexus Computing — Nnamdi Michael Okpala
// ============================================================
//
// f(n) = α(n) + γ(n)
//
// α(n) = actual path cost (standard A*)
// γ(n) = h_HERE_AND_NOW   (current distance to target)
//       + h_WHEN_AND_WHERE (estimated time to arrival)
//       + h_THERE_AND_THEN (historical delivery record)
//
// FILTER before FLASH:
//   Only FILTERED nodes may enter OPEN list.
//   Flash commits the final path — irreversible.
//   FILTER = pure functor (data only, no state mutation).
//
// Polar compass (from Filter-Flash_CISCO_Interdepency.psc):
//   NORTH = π/4   EAST = π/3
//   SOUTH = π/2   WEST = π  (high — polar anchor)
// ============================================================

#include <stdint.h>
#include <stdbool.h>
#include "../packet/nsigii_packet.h"
#include "../consensus/mmuko.h"

// ─────────────────────────────────────────────
// POLAR COMPASS (from CISCO Filter-Flash spec)
// θ = angle committed BEFORE movement
// λ = power/distribution of movement
// ─────────────────────────────────────────────

#define POLAR_NORTH  (M_PI / 4.0f)   // 0.7854 rad
#define POLAR_EAST   (M_PI / 3.0f)   // 1.0472 rad
#define POLAR_SOUTH  (M_PI / 2.0f)   // 1.5708 rad
#define POLAR_WEST   (M_PI)           // 3.1416 rad — HIGH anchor

typedef enum {
    DIR_NORTH = 0,
    DIR_EAST  = 1,
    DIR_SOUTH = 2,
    DIR_WEST  = 3,
    DIR_NONE  = 4
} PolarDirection;

// ─────────────────────────────────────────────
// GRID NODE — One cell in the routing space
// Maps to physical space (Buffon universe:
// space is free, time is the resource)
// ─────────────────────────────────────────────

#define ASTAR_MAX_NODES  1024
#define ASTAR_MAX_OPEN   512
#define ASTAR_MAX_PATH   256

typedef struct {
    int      id;            // node index
    Vector3  position;      // physical location in space
    float    g_cost;        // α(n): actual cost from start
    float    h_cost;        // γ(n): tripolar heuristic
    float    f_cost;        // f(n) = g + h
    int      parent_id;     // for path reconstruction
    bool     in_open;       // on open list
    bool     in_closed;     // already evaluated
    bool     is_obstacle;   // blocked (wall, hazard)
    Consensus local_consensus; // pole vote at this node
} AStarNode;

// ─────────────────────────────────────────────
// TRIPOLAR HEURISTIC WEIGHTS
// Each pole contributes independently
// ─────────────────────────────────────────────

typedef struct {
    float w_here;    // weight for HERE_AND_NOW  (default 1.0)
    float w_when;    // weight for WHEN_AND_WHERE (default 1.0)
    float w_there;   // weight for THERE_AND_THEN (default 1.0)
} TripolarWeights;

// ─────────────────────────────────────────────
// ASTAR CONTEXT — Full routing session
// ─────────────────────────────────────────────

typedef struct {
    AStarNode        nodes[ASTAR_MAX_NODES];
    int              node_count;
    int              open_list[ASTAR_MAX_OPEN];
    int              open_count;
    int              start_id;
    int              goal_id;
    TripolarWeights  weights;
    int              path[ASTAR_MAX_PATH];
    int              path_length;
    bool             path_found;
    float            total_cost;
    // Filter-Flash state
    bool             filter_passed;  // FILTER verified before FLASH
    bool             flash_committed; // FLASH = path locked into delivery
} AStarContext;

// ─────────────────────────────────────────────
// FUNCTION DECLARATIONS
// ─────────────────────────────────────────────

// Initialize routing context
AStarContext astar_init(TripolarWeights weights);

// Add a node to the grid
int astar_add_node(AStarContext* ctx, Vector3 position, bool is_obstacle);

// Set start and goal nodes
void astar_set_endpoints(AStarContext* ctx, int start_id, int goal_id);

// Tripolar heuristic: γ(n) = h_here + h_when + h_there
float astar_heuristic(const AStarNode* node,
                      const AStarNode* goal,
                      const TripolarWeights* w,
                      float delivery_history_score);

// HERE_AND_NOW component: Euclidean distance to target
float h_here_and_now(const Vector3* a, const Vector3* b);

// WHEN_AND_WHERE component: estimated time given drift
float h_when_and_where(const Vector3* a, const Vector3* b, float drift_radial);

// THERE_AND_THEN component: historical delivery success [0,1]
float h_there_and_then(float history_score);

// Filter functor: verify node before adding to open list
// Pure — does not mutate system state
bool astar_filter_node(const AStarNode* node, const NSIGII_Packet* pkt);

// Run A* search — returns true if path found
bool astar_search(AStarContext* ctx, const NSIGII_Packet* pkt);

// Flash: commit path to delivery — irreversible
bool astar_flash(AStarContext* ctx);

// Reconstruct path from goal to start
int astar_reconstruct_path(AStarContext* ctx, int goal_id);

// Get next waypoint on committed path
Vector3 astar_next_waypoint(const AStarContext* ctx, int step);

// Update node costs based on drift theorem
void astar_update_drift(AStarContext* ctx, const DriftVector* drift);

// Check if routing consensus has reached 0b111
bool astar_consensus_gate(const AStarContext* ctx);

#endif // ASTAR_TRIPOLAR_H
