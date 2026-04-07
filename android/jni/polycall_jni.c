// ============================================================
// polycall_jni.c — LibPolyCall JNI Bridge
// OBINexus Computing — Nnamdi Michael Okpala
// ============================================================
//
// Exposes the LibPolyCall state machine to Android Java via JNI.
// The polycall state machine governs NSIGII packet lifecycle
// transitions (PENDING → LOADED → FILTER → FLASH → DONE)
// with integrity verification at every transition.
//
// Java declarations (in NSIGIIMainActivity.java):
//   native boolean nativePolycallInit()
//   native int     nativePolycallTransition(int toStateId)
//   native String  nativePolycallGetState()
//   native int     nativePolycallGetStatus()
//   native void    nativePolycallReset()
//
// JNI package: com.obinexus.nsigii → NSIGIIMainActivity
// ============================================================

#include <jni.h>
#include <android/log.h>
#include <string.h>
#include <stdlib.h>

#include "polycall_state_machine.h"
#include "polycall.h"

#define LOG_TAG  "NSIGII_POLYCALL"
#define LOGI(...)  __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGD(...)  __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGE(...)  __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

#define JNI_MAIN(name) \
    Java_com_obinexus_nsigii_NSIGIIMainActivity_##name

// ─────────────────────────────────────────────
// NSIGII Packet State IDs (mirrors DroneState enum)
// PENDING=0 LOADED=1 FILTER=2 FLASH=3 DONE=4
// ─────────────────────────────────────────────
#define NSIGII_STATE_PENDING  0
#define NSIGII_STATE_LOADED   1
#define NSIGII_STATE_FILTER   2
#define NSIGII_STATE_FLASH    3
#define NSIGII_STATE_DONE     4

static const char *STATE_NAMES[] = {
    "PENDING", "LOADED", "FILTER", "FLASH", "DONE"
};

// ─────────────────────────────────────────────
// Global polycall state machine (one per process)
// ─────────────────────────────────────────────
static PolyCall_StateMachine g_sm;
static bool g_sm_ready = false;

// ─────────────────────────────────────────────
// nativePolycallInit() → boolean
//
// Initialises the LibPolyCall state machine with the
// 5-state NSIGII packet lifecycle.
// Returns true on success.
// ─────────────────────────────────────────────

JNIEXPORT jboolean JNICALL
JNI_MAIN(nativePolycallInit)(JNIEnv *env, jclass clazz) {
    (void)env; (void)clazz;

    memset(&g_sm, 0, sizeof(g_sm));

    polycall_sm_status_t status = polycall_sm_init(&g_sm, NULL);
    if (status != POLYCALL_SM_SUCCESS) {
        LOGE("polycall_sm_init failed: %d", (int)status);
        return JNI_FALSE;
    }

    // Register 5 NSIGII packet states
    for (int i = 0; i <= NSIGII_STATE_DONE; i++) {
        PolyCall_State s;
        memset(&s, 0, sizeof(s));
        strncpy(s.name, STATE_NAMES[i], POLYCALL_MAX_NAME_LENGTH - 1);
        s.id       = (unsigned int)i;
        s.is_final = (i == NSIGII_STATE_DONE);

        status = polycall_sm_add_state(&g_sm, &s);
        if (status != POLYCALL_SM_SUCCESS) {
            LOGE("add_state %s failed: %d", STATE_NAMES[i], (int)status);
            return JNI_FALSE;
        }
    }

    // Register valid transitions (linear + FLASH gate)
    // PENDING → LOADED
    // LOADED  → FILTER
    // FILTER  → FLASH  (consensus gate: 0b111 required)
    // FILTER  → LOADED (withdrawal — negation law)
    // FLASH   → DONE
    struct { int from; int to; const char *name; } transitions[] = {
        { NSIGII_STATE_PENDING, NSIGII_STATE_LOADED,  "load"       },
        { NSIGII_STATE_LOADED,  NSIGII_STATE_FILTER,  "filter"     },
        { NSIGII_STATE_FILTER,  NSIGII_STATE_FLASH,   "flash"      },
        { NSIGII_STATE_FILTER,  NSIGII_STATE_LOADED,  "withdraw"   },
        { NSIGII_STATE_FLASH,   NSIGII_STATE_DONE,    "done"       },
    };

    for (int i = 0; i < 5; i++) {
        PolyCall_Transition t;
        memset(&t, 0, sizeof(t));
        strncpy(t.name, transitions[i].name, POLYCALL_MAX_NAME_LENGTH - 1);
        t.from_state = (unsigned int)transitions[i].from;
        t.to_state   = (unsigned int)transitions[i].to;
        t.is_valid   = true;

        status = polycall_sm_add_transition(&g_sm, &t);
        if (status != POLYCALL_SM_SUCCESS) {
            LOGE("add_transition %s failed: %d", transitions[i].name, (int)status);
            return JNI_FALSE;
        }
    }

    g_sm_ready = true;
    LOGI("PolyCall state machine initialised: 5 states, 5 transitions");
    return JNI_TRUE;
}

// ─────────────────────────────────────────────
// nativePolycallTransition(int toStateId) → int
//
// Requests a state transition to toStateId.
// Returns polycall_sm_status_t (0 = SUCCESS).
// ─────────────────────────────────────────────

JNIEXPORT jint JNICALL
JNI_MAIN(nativePolycallTransition)(JNIEnv *env, jclass clazz, jint toStateId) {
    (void)env; (void)clazz;

    if (!g_sm_ready) {
        LOGE("nativePolycallTransition: state machine not initialised");
        return (jint)POLYCALL_SM_ERROR_NOT_INITIALIZED;
    }

    unsigned int to = (unsigned int)(toStateId & 0xFF);
    polycall_sm_status_t status = polycall_sm_transition(&g_sm, to);

    if (status == POLYCALL_SM_SUCCESS) {
        const char *name = (to <= NSIGII_STATE_DONE) ? STATE_NAMES[to] : "?";
        LOGD("polycall transition → %s (%d)", name, to);
    } else {
        LOGE("polycall transition to %d failed: %d", to, (int)status);
    }

    return (jint)status;
}

// ─────────────────────────────────────────────
// nativePolycallGetState() → String
//
// Returns the name of the current state.
// ─────────────────────────────────────────────

JNIEXPORT jstring JNICALL
JNI_MAIN(nativePolycallGetState)(JNIEnv *env, jclass clazz) {
    (void)clazz;

    if (!g_sm_ready) {
        return (*env)->NewStringUTF(env, "UNINITIALISED");
    }

    unsigned int cur = g_sm.current_state;
    const char  *name = (cur <= NSIGII_STATE_DONE) ? STATE_NAMES[cur] : "UNKNOWN";
    LOGD("polycall current state: %s (%u)", name, cur);
    return (*env)->NewStringUTF(env, name);
}

// ─────────────────────────────────────────────
// nativePolycallGetStatus() → int
//
// Returns current state ID (0–4 = PENDING..DONE)
// ─────────────────────────────────────────────

JNIEXPORT jint JNICALL
JNI_MAIN(nativePolycallGetStatus)(JNIEnv *env, jclass clazz) {
    (void)env; (void)clazz;

    if (!g_sm_ready) return -1;
    return (jint)g_sm.current_state;
}

// ─────────────────────────────────────────────
// nativePolycallReset() → void
//
// Resets state machine to PENDING (start state).
// Used after DONE or on new delivery cycle.
// ─────────────────────────────────────────────

JNIEXPORT void JNICALL
JNI_MAIN(nativePolycallReset)(JNIEnv *env, jclass clazz) {
    (void)env; (void)clazz;

    if (!g_sm_ready) return;
    g_sm.current_state = NSIGII_STATE_PENDING;
    LOGI("polycall state machine reset → PENDING");
}
