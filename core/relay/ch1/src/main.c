/* ============================================================================
 * NSIGII CHANNEL 1 MAIN — Receiver Process (EZE Pole / Transit Actuator)
 * OBINexus Computing — Nnamdi Michael Okpala
 * Rectorial Reasoning Rational Wheel Framework
 * Tomographic Pair Resolving
 * ============================================================================
 *
 * Channel 1 = 2 * 2/3 — EZE Pole (Leadership) — Bearing 29°
 *
 * Separation of Concerns (Tripartite Architecture):
 *   ch0 (UCHE) — Transmitter — SENDS packets from source
 *   ch1 (EZE)  — Receiver   — RECEIVES and does tomographic pair resolving,
 *                               then FORWARDS to ch2 for verification
 *   ch2 (OBI)  — Verifier   — VERIFIES consensus and BROADCASTS result
 *
 * NOTE: ch1 no longer self-verifies. Verification is the exclusive
 *       responsibility of ch2 (OBI pole). ch1 forwards packets to
 *       ch2 on PORT_VERIFIER (8003) after tomographic pair validation.
 *       This enforces the tripartite separation of concerns.
 */

#include "nsigii.h"
#include "receiver/receiver.h"
#include "serialization.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>
#include <pthread.h>

#ifdef _WIN32
#  include <winsock2.h>
#  include <ws2tcpip.h>
#else
#  include <sys/socket.h>
#  include <netinet/in.h>
#  include <arpa/inet.h>
#endif

/* ============================================================================
 * GLOBAL STATE
 * ============================================================================ */

static volatile int system_active = 1;
static nsigii_receiver_t* g_receiver = NULL;
static uint16_t g_wheel_position = 0;
static uint32_t g_forwarded_count = 0;

/* ============================================================================
 * FORWARD TO CH2 — sends decoded packet to verifier on PORT_VERIFIER
 * ============================================================================ */

static int forward_to_ch2(const nsigii_packet_t *packet) {
    if (!packet) return -1;

#ifdef _WIN32
    SOCKET sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock == INVALID_SOCKET) return -1;
#else
    int sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock < 0) return -1;
#endif

    struct sockaddr_in ch2_addr;
    memset(&ch2_addr, 0, sizeof(ch2_addr));
    ch2_addr.sin_family      = AF_INET;
    ch2_addr.sin_port        = htons(PORT_VERIFIER);
    ch2_addr.sin_addr.s_addr = inet_addr("127.0.0.3");  /* ch2 (OBI) loopback */

    int sent = (int)sendto(sock,
                           (const char*)packet, sizeof(nsigii_packet_t), 0,
                           (struct sockaddr*)&ch2_addr, sizeof(ch2_addr));

#ifdef _WIN32
    closesocket(sock);
#else
    close(sock);
#endif

    if (sent != (int)sizeof(nsigii_packet_t)) {
        fprintf(stderr, "[CH1] Failed to forward packet to ch2\n");
        return -1;
    }

    g_forwarded_count++;
    return 0;
}

/* ============================================================================
 * SIGNAL HANDLERS
 * ============================================================================ */

void signal_handler(int sig) {
    (void)sig;
    printf("\n[CH1] Shutting down receiver/verifier...\n");
    system_active = 0;
}

/* ============================================================================
 * BANNER
 * ============================================================================ */

void print_banner(void) {
    printf("\n");
    printf("╔══════════════════════════════════════════════════════════════════╗\n");
    printf("║  NSIGII COMMAND AND CONTROL HUMAN RIGHTS VERIFICATION SYSTEM    ║\n");
    printf("║  Channel 1: RECEIVER (2 * 2/3) — EZE POLE — Transit Actuator   ║\n");
    printf("║  Bearing: 29° | Leadership | Tomographic Pair Resolving          ║\n");
    printf("║  Forwards verified packets to ch2 (OBI/Verifier) on port 8003   ║\n");
    printf("╚══════════════════════════════════════════════════════════════════╝\n");
    printf("Version: %s | Receive port: %d | Forwards to: ch2:%d\n\n",
           NSIGII_VERSION, PORT_RECEIVER, PORT_VERIFIER);
}

/* ============================================================================
 * TOMOGRAPHIC PAIR RESOLVING
 * ============================================================================ */

void print_tomographic_result(const nsigii_tomographic_pair_t* pair) {
    printf("[CH1] Tomographic Pair Analysis:\n");
    printf("      Correlation: %.4f | Resolved: %s\n",
           pair->correlation, pair->resolved ? "YES" : "NO");
    
    for (int i = 0; i < 2; i++) {
        if (pair->pair[i]) {
            printf("      Packet[%d]: Seq=%u Wheel=%d°\n",
                   i, pair->pair[i]->header.sequence_token,
                   pair->pair[i]->topology.wheel_position);
        }
    }
}

int process_tomographic_pair(nsigii_receiver_t* receiver,
                              nsigii_packet_t* packet1,
                              nsigii_packet_t* packet2) {
    if (!receiver || !packet1 || !packet2) return -1;
    
    /* Create tomographic pair */
    nsigii_tomographic_pair_t pair;
    memset(&pair, 0, sizeof(pair));
    pair.pair[0] = packet1;
    pair.pair[1] = packet2;
    
    /* Compute correlation */
    pair.correlation = nsigii_tomographic_compute_correlation(packet1, packet2);
    
    /* Validate pair */
    pair.resolved = nsigii_tomographic_validate_pair(&pair);
    
    print_tomographic_result(&pair);
    
    if (pair.resolved) {
        /* Tomographic pair resolved — forward BOTH packets to ch2 (OBI verifier).
         * ch1 does NOT self-verify. Verification is ch2's sole responsibility.
         * This enforces tripartite separation of concerns:
         *   ch0 (UCHE) = TRANSMIT, ch1 (EZE) = RECEIVE, ch2 (OBI) = VERIFY */
        printf("[CH1] ✓ Pair resolved (corr=%.4f) → forwarding to ch2:%d\n",
               pair.correlation, PORT_VERIFIER);

        if (forward_to_ch2(packet1) == 0) {
            printf("[CH1] ✓ Packet[0] forwarded to ch2\n");
        }
        if (forward_to_ch2(packet2) == 0) {
            printf("[CH1] ✓ Packet[1] forwarded to ch2\n");
        }
    } else {
        printf("[CH1] ✗ Tomographic pair resolution failed — not forwarding to ch2\n");
    }
    
    return pair.resolved ? 0 : -1;
}

/* ============================================================================
 * MAIN COMMAND AND CONTROL LOOP
 * ============================================================================ */

int main(int argc, char* argv[]) {
    (void)argc;
    (void)argv;

#ifdef _WIN32
    WSADATA wsa;
    WSAStartup(MAKEWORD(2,2), &wsa);
#endif

    /* Set up signal handlers */
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    print_banner();

    /* Initialize receiver (EZE pole — transit only, no self-verification) */
    printf("[CH1] Initialising EZE receiver (Channel 1 — 2*2/3)...\n");
    if (nsigii_receiver_create(&g_receiver) != 0) {
        fprintf(stderr, "[CH1] Failed to create receiver\n");
        return 1;
    }

    /* Start receiver worker */
    printf("[CH1] Starting receiver worker on port %d...\n", PORT_RECEIVER);
    if (nsigii_receiver_start_worker(g_receiver) != 0) {
        fprintf(stderr, "[CH1] Failed to start receiver worker\n");
        nsigii_receiver_destroy(g_receiver);
        return 1;
    }

    printf("[CH1] EZE Receiver ready. Receives from ch0, forwards to ch2...\n\n");
    
    /* Main verification loop with tomographic pair resolving */
    nsigii_packet_t packet_buffer[2];
    int packet_count = 0;
    
    while (system_active) {
        /* Receive packet */
        nsigii_packet_t packet;
        memset(&packet, 0, sizeof(packet));
        
        if (nsigii_receiver_receive(g_receiver, &packet) == 0) {
            printf("[CH1] Packet received from transmitter:\n");
            printf("      Channel: %d | Sequence: %u | Bipolar: %s\n",
                   packet.header.channel_id,
                   packet.header.sequence_token,
                   nsigii_receiver_bipolar_state_string(
                       nsigii_receiver_determine_bipolar_state(packet.header.sequence_token)));
            
            /* Store packet for tomographic pairing */
            memcpy(&packet_buffer[packet_count], &packet, sizeof(nsigii_packet_t));
            packet_count++;
            
            /* Process pair when we have 2 packets */
            if (packet_count >= 2) {
                process_tomographic_pair(g_receiver,
                                         &packet_buffer[0], &packet_buffer[1]);
                packet_count = 0;
                printf("\n");
            }
            
            /* Forward individual packet to ch2 as well (belt-and-suspenders) */
            nsigii_receiver_forward_to_verifier(g_receiver, &packet);

            /* Rectorial Reasoning: Update Rational Wheel (EZE at 29°) */
            g_wheel_position = (uint16_t)((g_wheel_position + 1) % 360);
            nsigii_rotate_rational_wheel(1);
        }
        
        usleep(1000);  /* 1ms sleep to prevent CPU spinning */
    }
    
    /* Cleanup */
    printf("\n[CH1] Forwarded %u packets to ch2 (OBI verifier)\n", g_forwarded_count);
    printf("[CH1] Cleaning up...\n");
    nsigii_receiver_stop_worker(g_receiver);
    nsigii_receiver_destroy(g_receiver);

#ifdef _WIN32
    WSACleanup();
#endif

    printf("[CH1] Shutdown complete.\n");
    return 0;
}
