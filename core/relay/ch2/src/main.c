/* ============================================================================
 * NSIGII CHANNEL 2 MAIN — Verifier + Broadcast Process
 * OBINexus Computing — Nnamdi Michael Okpala
 * ============================================================================
 *
 * Channel 2 = 3 * 3/3 — OBI Pole (Heart/Nexus) — Bearing 265°
 * This is the constitutional VERIFIER and BROADCASTER.
 *
 * Responsibilities:
 *   1. Receive forwarded packets from Channel 1 (Receiver) on PORT_VERIFIER 8003
 *   2. Run RWX chain validation (Write → Read → Execute)
 *   3. Compute bipartite consensus (2/3 majority)
 *   4. Verify human rights protocol compliance
 *   5. Check wheel position integrity (expected 240°)
 *   6. BROADCAST consensus results to:
 *      a. WebSocket clients on PORT_WEBSOCKET 8080
 *      b. UDP multicast on 239.255.42.99:9003 (NSIGII constitutional network)
 *
 * Tripartite Separation of Concerns:
 *   ch0 (UCHE) → TRANSMIT     — "I send"
 *   ch1 (EZE)  → RECEIVE      — "I transit"
 *   ch2 (OBI)  → VERIFY+CAST  — "I receive and make it law"
 *
 * AXIOM: "The machine bears suffering, not the person"
 * Σ = (N − R) × K must reach 0 before FLASH is committed.
 *
 * NSIGII is a Human Rights Protocol.
 * Food, water, shelter — delivered free of charge.
 * Not a weapon. Not a toy.
 * ============================================================================ */

#include "verifier/verifier.h"
#include "nsigii.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>
#include <pthread.h>
#include <time.h>

#ifdef _WIN32
#  include <winsock2.h>
#  include <ws2tcpip.h>
#  pragma comment(lib, "ws2_32.lib")
#else
#  include <sys/socket.h>
#  include <netinet/in.h>
#  include <arpa/inet.h>
#endif

/* ============================================================================
 * CONSTANTS
 * ============================================================================ */

#define NSIGII_BROADCAST_MULTICAST "239.255.42.99"
#define NSIGII_BROADCAST_UDP_PORT  9003
#define BROADCAST_BUF_SIZE         2048

/* ============================================================================
 * GLOBAL STATE
 * ============================================================================ */

static volatile int system_active = 1;
static nsigii_verifier_t* g_verifier = NULL;
static uint16_t g_wheel_position = 0;
static uint32_t g_consensus_count = 0;
static uint32_t g_broadcast_count = 0;

/* ============================================================================
 * SIGNAL HANDLERS
 * ============================================================================ */

static void signal_handler(int sig) {
    (void)sig;
    printf("\n[CH2] Shutting down verifier/broadcaster...\n");
    system_active = 0;
}

/* ============================================================================
 * BANNER
 * ============================================================================ */

static void print_banner(void) {
    printf("\n");
    printf("╔══════════════════════════════════════════════════════════════════╗\n");
    printf("║  NSIGII COMMAND AND CONTROL HUMAN RIGHTS VERIFICATION SYSTEM    ║\n");
    printf("║  Channel 2: VERIFIER + BROADCASTER (3 * 3/3) — OBI POLE        ║\n");
    printf("║  Bearing: 265° | Heart/Nexus | Receive Actuator                 ║\n");
    printf("║  AXIOM: collapse = received | Filter before Flash                ║\n");
    printf("╚══════════════════════════════════════════════════════════════════╝\n");
    printf("Version: %s | Port: %d | Broadcast: %s:%d\n\n",
           NSIGII_VERSION, PORT_VERIFIER,
           NSIGII_BROADCAST_MULTICAST, NSIGII_BROADCAST_UDP_PORT);
}

/* ============================================================================
 * BROADCAST — UDP Multicast + WebSocket
 * ============================================================================ */

/* Build JSON consensus broadcast payload */
static int build_consensus_json(char *buf, size_t len,
                                 const nsigii_consensus_message_t *msg,
                                 const nsigii_verification_result_t *result,
                                 uint32_t seq_num) {
    return snprintf(buf, len,
        "{"
        "\"channel\":2,"
        "\"pole\":\"OBI\","
        "\"bearing\":265,"
        "\"axiom\":\"collapse=received\","
        "\"seq\":%u,"
        "\"consensus_score\":%.4f,"
        "\"verified\":%s,"
        "\"status\":\"%s\","
        "\"wheel_position\":%u,"
        "\"broadcast_count\":%u,"
        "\"resource_types\":[\"FOOD\",\"WATER\",\"SHELTER\"],"
        "\"human_rights\":true,"
        "\"flash_committed\":%s"
        "}",
        seq_num,
        result ? result->consensus_score : 0.0,
        (result && result->verified_packet) ? "true" : "false",
        msg ? msg->status : "UNKNOWN",
        (unsigned)g_wheel_position,
        g_broadcast_count,
        (result && result->consensus_score >= CONSENSUS_THRESHOLD) ? "true" : "false"
    );
}

/* Broadcast to UDP multicast — NSIGII constitutional network */
static void broadcast_udp(const char *json, size_t len) {
#ifdef _WIN32
    SOCKET sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock == INVALID_SOCKET) return;
#else
    int sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock < 0) return;
#endif

    int ttl = 1;
#ifdef _WIN32
    setsockopt(sock, IPPROTO_IP, IP_MULTICAST_TTL, (char*)&ttl, sizeof(ttl));
#else
    setsockopt(sock, IPPROTO_IP, IP_MULTICAST_TTL, &ttl, sizeof(ttl));
#endif

    struct sockaddr_in dst;
    memset(&dst, 0, sizeof(dst));
    dst.sin_family      = AF_INET;
    dst.sin_port        = htons(NSIGII_BROADCAST_UDP_PORT);
    dst.sin_addr.s_addr = inet_addr(NSIGII_BROADCAST_MULTICAST);

    sendto(sock, json, (int)len, 0, (struct sockaddr*)&dst, sizeof(dst));

#ifdef _WIN32
    closesocket(sock);
#else
    close(sock);
#endif
}

/* Broadcast to WebSocket clients via loopback IPC (write to shared pipe/socket) */
static void broadcast_websocket(const char *json) {
    /* Write consensus JSON to WebSocket bridge socket on loopback:8082 */
    /* The websocket_server.c process reads from this and forwards to clients */
#ifdef _WIN32
    SOCKET sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock == INVALID_SOCKET) return;
#else
    int sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock < 0) return;
#endif

    struct sockaddr_in ws_addr;
    memset(&ws_addr, 0, sizeof(ws_addr));
    ws_addr.sin_family      = AF_INET;
    ws_addr.sin_port        = htons(8082);
    ws_addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    sendto(sock, json, (int)strlen(json), 0,
           (struct sockaddr*)&ws_addr, sizeof(ws_addr));

#ifdef _WIN32
    closesocket(sock);
#else
    close(sock);
#endif
}

/* ============================================================================
 * VERIFICATION LOOP
 * ============================================================================ */

static int verify_and_broadcast(nsigii_verifier_t *verifier,
                                  nsigii_packet_t  *packet) {
    if (!verifier || !packet) return -1;

    nsigii_verification_result_t result;
    memset(&result, 0, sizeof(result));

    /* Run full RWX chain + bipartite consensus verification */
    int rc = nsigii_verifier_verify_packet(verifier, packet, &result);

    if (rc == 0) {
        printf("[CH2] ✓ Packet verified\n");
        printf("      Score: %.4f | Wheel: %u° | Status: %s\n",
               result.consensus_score, g_wheel_position, result.status);

        /* Emit consensus message */
        nsigii_consensus_message_t consensus;
        memset(&consensus, 0, sizeof(consensus));
        nsigii_verifier_emit_consensus_message(verifier,
                                               result.verified_packet,
                                               &consensus);

        g_consensus_count++;

        /* Build broadcast payload */
        char json[BROADCAST_BUF_SIZE];
        int jlen = build_consensus_json(json, sizeof(json),
                                        &consensus, &result,
                                        g_consensus_count);
        if (jlen > 0) {
            broadcast_udp(json, (size_t)jlen);
            broadcast_websocket(json);
            g_broadcast_count++;
            printf("[CH2] ✓ Broadcast %u: score=%.4f → UDP+WS\n",
                   g_broadcast_count, result.consensus_score);
        }

        if (result.verified_packet) {
            free(result.verified_packet);
        }
    } else {
        printf("[CH2] ✗ Verification failed: %s\n", result.status);
    }

    return rc;
}

/* ============================================================================
 * MAIN
 * ============================================================================ */

int main(int argc, char *argv[]) {
    (void)argc; (void)argv;

#ifdef _WIN32
    WSADATA wsa;
    WSAStartup(MAKEWORD(2,2), &wsa);
#endif

    signal(SIGINT,  signal_handler);
    signal(SIGTERM, signal_handler);

    print_banner();

    /* Initialise verifier */
    printf("[CH2] Initialising OBI verifier (Channel 2 — 3*3/3)...\n");
    if (nsigii_verifier_create(&g_verifier) != 0) {
        fprintf(stderr, "[CH2] Failed to create verifier\n");
        return 1;
    }

    if (nsigii_verifier_start_worker(g_verifier) != 0) {
        fprintf(stderr, "[CH2] Failed to start verifier worker\n");
        nsigii_verifier_destroy(g_verifier);
        return 1;
    }

    printf("[CH2] OBI Verifier ready. Listening on port %d...\n", PORT_VERIFIER);
    printf("[CH2] Broadcasting to %s:%d + WS:8082\n\n",
           NSIGII_BROADCAST_MULTICAST, NSIGII_BROADCAST_UDP_PORT);

    /* Main loop — receive packets forwarded by ch1 and verify+broadcast */
    while (system_active) {
        nsigii_packet_t packet;
        memset(&packet, 0, sizeof(packet));

        /* The verifier worker receives on PORT_VERIFIER internally.
         * poll for packets from the worker's consensus queue. */
        if (nsigii_verifier_receive_packet(g_verifier, &packet) == 0) {
            printf("[CH2] Packet received from ch1:\n");
            printf("      Channel: %d | Seq: %u\n",
                   packet.header.channel_id,
                   packet.header.sequence_token);

            verify_and_broadcast(g_verifier, &packet);

            /* Advance wheel — 240° checkpoint at verifier */
            g_wheel_position = (uint16_t)((g_wheel_position + 2) % 360);
            nsigii_rotate_rational_wheel(2);

            if (g_wheel_position == VERIFIER_EXPECTED_WHEEL_POS) {
                printf("[CH2] ✓ Wheel at 240° checkpoint — OBI APEX reached\n");
            }
        }

        usleep(1000);  /* 1ms polling */
    }

    /* Cleanup */
    printf("\n[CH2] Consensus total: %u | Broadcasts: %u\n",
           g_consensus_count, g_broadcast_count);
    printf("[CH2] Cleaning up...\n");

    nsigii_verifier_stop_worker(g_verifier);
    nsigii_verifier_destroy(g_verifier);

#ifdef _WIN32
    WSACleanup();
#endif

    printf("[CH2] Shutdown complete. Constitutional record preserved.\n");
    return 0;
}
