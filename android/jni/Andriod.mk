# ============================================================
# Android.mk — NDK Build: Java ↔ C consensus/drift bridge
# OBINexus Computing — Nnamdi Michael Okpala
# ============================================================
#
# Builds libnsigii_core.so — the C constitutional layer
# loaded by DroneController via System.loadLibrary("nsigii_core")
#
# Includes:
#   mmuko.c          — consent/consensus reduction engine
#   drift_theorem.c  — V(t)=P-C, Dr, Dω, W=(2/3)P+(1/3)C
#   loopback_ping.c  — Marco Polo protocol, LMAC, theta
#   astar_tripolar.c — A* + tripolar heuristic routing
#   nsigii_jni.c     — JNI bridge (Java → C calls)
#   nsigii.c         — OBIX NSIGII state machine (ObixProbe, ObixGraph)
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
    nsigii_jni.c                              \
    ../../../core/consensus/mmuko.c           \
    ../../../core/drift/drift_theorem.c       \
    ../../../core/loopback/loopback_ping.c    \
    ../../../core/routing/astar_tripolar.c    \
    nsigii.c

# ── Include paths ──
LOCAL_C_INCLUDES := \
    $(LOCAL_PATH)                             \
    $(LOCAL_PATH)/../../../core/consensus     \
    $(LOCAL_PATH)/../../../core/drift         \
    $(LOCAL_PATH)/../../../core/loopback      \
    $(LOCAL_PATH)/../../../core/routing       \
    $(LOCAL_PATH)/../../../core/packet        \
    $(LOCAL_PATH)/../../../shared/include

# ── Compiler flags ──
LOCAL_CFLAGS := \
    -std=c11                                  \
    -Wall                                     \
    -Wextra                                   \
    -O2                                       \
    -fvisibility=hidden                       \
    -DANDROID                                 \
    -DOBINEXUS_NSIGII_VERSION=\"0.1.0\"

# ── Linker flags ──
LOCAL_LDLIBS := \
    -llog                                     \
    -lm                                       \
    -landroid

# ── Build as shared library ──
include $(BUILD_SHARED_LIBRARY)

# ─────────────────────────────────────────────
# Optional: static archive for testing
# Uncomment to build libnsigii_core_static.a
# ─────────────────────────────────────────────

# include $(CLEAR_VARS)
# LOCAL_MODULE         := nsigii_core_static
# LOCAL_SRC_FILES      := $(LOCAL_SRC_FILES)
# LOCAL_C_INCLUDES     := $(LOCAL_C_INCLUDES)
# LOCAL_CFLAGS         := $(LOCAL_CFLAGS)
# include $(BUILD_STATIC_LIBRARY)
