# ============================================================
# Android.mk — NDK Build: NSIGII Constitutional Core
# OBINexus Computing — Nnamdi Michael Okpala
# ============================================================
#
# Builds libnsigii_core.so — the C tripartite consensus layer
# loaded by DroneController via System.loadLibrary("nsigii_core")
#
# Three-Channel Trident Architecture:
#   ch0 (UCHE/Knowledge)    — Transmitter — Channel 0 — Port 8001
#   ch1 (EZE/Leadership)    — Receiver    — Channel 1 — Port 8002
#   ch2 (OBI/Heart)         — Verifier    — Channel 2 — Port 8003
#
# Includes:
#   nsigii_jni.c         — JNI bridge (Java → C calls)
#   polycall_jni.c       — LibPolyCall JNI bridge
#   mmuko.c              — consent/consensus reduction engine
#   drift_theorem.c      — V(t)=P-C, Dr, Dω, W=(2/3)P+(1/3)C
#   loopback_ping.c      — Marco Polo protocol, LMAC, theta
#   astar_tripolar.c     — A* + tripolar heuristic routing
#   nsigii.c             — OBIX NSIGII state machine
#   nsigii_magnetic.c    — MASMIC/MMUKO magnetic semantic physics layer
#   polycall_state_machine.c — LibPolyCall state machine
#   polycall_protocol.c  — LibPolyCall protocol handler
#
# C standard: C11
# NDK min API: 21 (Android 5.0 Lollipop)
# ============================================================

LOCAL_PATH := $(call my-dir)

# ─────────────────────────────────────────────
# Module: nsigii_core
# Shared library loaded by DroneController.java
# ─────────────────────────────────────────────

include $(CLEAR_VARS)

LOCAL_MODULE    := nsigii_core
LOCAL_MODULE_FILENAME := libnsigii_core

# ── Source files ──
LOCAL_SRC_FILES := \
    nsigii_jni.c                                              \
    polycall_jni.c                                            \
    ../../../core/consensus/mmuko.c                           \
    ../../../core/drift/drift_theorem.c                       \
    ../../../core/loopback/loopback_ping.c                    \
    ../../../core/routing/astar_tripolar.c                    \
    ../../../core/packet/nsigii.c                             \
    ../../../core/drone/nsigii_magnetic.c                     \
    ../../../libpolycall-v1/libpolycall-v1/src/polycall_state_machine.c \
    ../../../libpolycall-v1/libpolycall-v1/src/polycall_protocol.c      \
    ../../../libpolycall-v1/libpolycall-v1/src/polycall_tokenizer.c     \
    ../../../libpolycall-v1/libpolycall-v1/src/polycall_token.c

# ── Include paths ──
LOCAL_C_INCLUDES := \
    $(LOCAL_PATH)                                             \
    $(LOCAL_PATH)/../../../core/consensus                     \
    $(LOCAL_PATH)/../../../core/drift                         \
    $(LOCAL_PATH)/../../../core/loopback                      \
    $(LOCAL_PATH)/../../../core/routing                       \
    $(LOCAL_PATH)/../../../core/packet                        \
    $(LOCAL_PATH)/../../../core/drone                         \
    $(LOCAL_PATH)/../../../core/runtime                       \
    $(LOCAL_PATH)/../../../shared/include                     \
    $(LOCAL_PATH)/../../../libpolycall-v1/libpolycall-v1/include

# ── Compiler flags ──
LOCAL_CFLAGS := \
    -std=c11                                                  \
    -Wall                                                     \
    -Wextra                                                   \
    -O2                                                       \
    -fvisibility=hidden                                       \
    -DANDROID                                                 \
    -DOBINEXUS_NSIGII_VERSION=\"0.2.0\"                       \
    -DNSIGII_CHANNEL_0=0                                      \
    -DNSIGII_CHANNEL_1=1                                      \
    -DNSIGII_CHANNEL_2=2

# ── Linker flags ──
LOCAL_LDLIBS := \
    -llog                                                     \
    -lm                                                       \
    -landroid

# ── Build as shared library ──
include $(BUILD_SHARED_LIBRARY)
