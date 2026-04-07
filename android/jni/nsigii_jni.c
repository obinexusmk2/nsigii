// ============================================================
// nsigii_jni.c — JNI Bridge: Java ↔ C Constitutional Core
// OBINexus Computing — Nnamdi Michael Okpala
// ============================================================
//
// Exposes the C core to DroneController.java via JNI.
//
// Java declarations (in DroneController.java):
//   native int    nativeReduceConsensus(int here, int when, int there)
//   native int    nativeNegateConsensus(int consensus)
//   native float  nativeComputeDrift(float px,py,pz, cx,cy,cz)
//   native float[] nativeComputeIntercept(float px,py,pz, cx,cy,cz)
//   native float  nativeProbeDiscriminant(float a, float b, float c)
//   native float  nativeWelfare(float t, float cost, float payload)
//
// MASMIC / MMUKO Magnetic Model (Java in NSIGIIMainActivity):
//   native float  nativeMagCollapseRatio(float extension, float force, float k)
//   native int    nativeMagTeleport(String content, float force, float stiffness)
//   native boolean nativeUcheEncode(String content, float force, float stiffness)
//   native int    nativeEzeControl(float extension, float force, float stiffness)
//   native boolean nativeObiReceive(float extension, float force, float stiffness)
//
// JNI naming convention:
//   Java_<package_underscored>_<ClassName>_<methodName>
//   package: com.obinexus.nsigii.drone   → DroneController
//   package: com.obinexus.nsigii         → NSIGIIMainActivity
//
// FIX: Token-paste macro for correct JNI symbol generation.
//      The old `#define JNI_PREFIX` did NOT expand inside identifier tokens.
//      `JNI_FUNC(name)` uses the ## paste operator to produce the correct name.
// ============================================================

#include <jni.h>
#include <android/log.h>
#include <math.h>
#include <string.h>
#include <stdlib.h>

#include "mmuko.h"
#include "drift_theorem.h"
#include "nsigii.h"
#include "nsigii_magnetic.h"

#define LOG_TAG  "NSIGII_JNI"
#define LOGI(...)  __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGD(...)  __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGE(...)  __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// ─────────────────────────────────────────────
// Token-paste JNI function name macros
// DroneController  → com.obinexus.nsigii.drone
// NSIGIIMainActivity → com.obinexus.nsigii
// ─────────────────────────────────────────────
#define JNI_DRONE(name) \
    Java_com_obinexus_nsigii_drone_DroneController_##name

#define JNI_MAIN(name) \
    Java_com_obinexus_nsigii_NSIGIIMainActivity_##name

// ─────────────────────────────────────────────
// Global MASMIC trident (initialised in JNI_OnLoad)
// ─────────────────────────────────────────────
static nsigii_mag_trident_t g_trident;

// ─────────────────────────────────────────────
// nativeReduceConsensus(int here, int when, int there) → int
//
// Maps Java int votes to C Consent enum:
//   0 = NO, 1 = MAYBE_NOT, 2 = MAYBE, 3 = YES
// Returns 0–7 (Consensus enum value)
// ─────────────────────────────────────────────

JNIEXPORT jint JNICALL
JNI_DRONE(nativeReduceConsensus)(JNIEnv *env, jclass clazz,
                                  jint here, jint when, jint there) {
    (void)env; (void)clazz;

    Consent h = (Consent)(here  & 0x3);
    Consent w = (Consent)(when  & 0x3);
    Consent t = (Consent)(there & 0x3);

    Consensus result = reduce_consensus(h, w, t);

    LOGD("reduceConsensus: here=%d when=%d there=%d → 0b%d%d%d (%s)",
         here, when, there,
         (result >> 2) & 1, (result >> 1) & 1, result & 1,
         consensus_name(result));

    return (jint)result;
}

// ─────────────────────────────────────────────
// nativeNegateConsensus(int consensus) → int
//
// -MAYBE_NOT_X == MAYBE_X (self-inverting)
// bit flip of 3-bit consensus value
// ─────────────────────────────────────────────

JNIEXPORT jint JNICALL
JNI_DRONE(nativeNegateConsensus)(JNIEnv *env, jclass clazz,
                                  jint consensus) {
    (void)env; (void)clazz;

    Consensus c  = (Consensus)(consensus & 0x7);
    Consensus nc = negate_consensus(c);

    LOGD("negateConsensus: 0b%d%d%d → 0b%d%d%d",
         (c  >> 2) & 1, (c  >> 1) & 1, c  & 1,
         (nc >> 2) & 1, (nc >> 1) & 1, nc & 1);

    return (jint)nc;
}

// ─────────────────────────────────────────────
// nativeComputeDrift(px,py,pz, cx,cy,cz) → float
//
// Returns radial drift Dr = |P - C| magnitude
// V = P - C
// ─────────────────────────────────────────────

JNIEXPORT jfloat JNICALL
JNI_DRONE(nativeComputeDrift)(JNIEnv *env, jclass clazz,
                               jfloat px, jfloat py, jfloat pz,
                               jfloat cx, jfloat cy, jfloat cz) {
    (void)env; (void)clazz;

    Vector3 P = {px, py, pz};
    Vector3 C = {cx, cy, cz};
    Vector3 V = drift_compute_V(&P, &C);

    float magnitude = vec3_magnitude(&V);

    LOGD("computeDrift: P=(%.3f,%.3f,%.3f) C=(%.3f,%.3f,%.3f) |V|=%.4f",
         px, py, pz, cx, cy, cz, magnitude);

    return (jfloat)magnitude;
}

// ─────────────────────────────────────────────
// nativeComputeIntercept(px,py,pz, cx,cy,cz) → float[]
//
// Returns W = (2/3)*P + (1/3)*C
// "The drone does NOT fly to P or C — it flies to W."
// Returns float[3] = {wx, wy, wz}
// ─────────────────────────────────────────────

JNIEXPORT jfloatArray JNICALL
JNI_DRONE(nativeComputeIntercept)(JNIEnv *env, jclass clazz,
                                   jfloat px, jfloat py, jfloat pz,
                                   jfloat cx, jfloat cy, jfloat cz) {
    (void)clazz;

    Vector3 P = {px, py, pz};
    Vector3 C = {cx, cy, cz};
    Vector3 W = drift_compute_W(&P, &C);

    jfloatArray result = (*env)->NewFloatArray(env, 3);
    if (!result) return NULL;

    jfloat buf[3] = {(jfloat)W.x, (jfloat)W.y, (jfloat)W.z};
    (*env)->SetFloatArrayRegion(env, result, 0, 3, buf);

    LOGD("computeIntercept: W=(%.4f, %.4f, %.4f)", W.x, W.y, W.z);

    return result;
}

// ─────────────────────────────────────────────
// nativeProbeDiscriminant(a, b, c) → float
//
// Δ = b² - 4ac
// From ObixProbe in nsigii.h:
//   Δ > 0 → ASYMMETRIC (two paths)
//   Δ = 0 → SYMMETRIC  (exact intercept)
//   Δ < 0 → SUPERPOSITION (MAYBE state)
// ─────────────────────────────────────────────

JNIEXPORT jfloat JNICALL
JNI_DRONE(nativeProbeDiscriminant)(JNIEnv *env, jclass clazz,
                                    jfloat a, jfloat b, jfloat c) {
    (void)env; (void)clazz;

    ObixProbe probe = obix_probe_compute((double)a, (double)b, (double)c);

    LOGD("probeDiscriminant: a=%.3f b=%.3f c=%.3f Δ=%.6f state=%s",
         a, b, c, (float)probe.discriminant,
         obix_state_label(probe.state));

    return (jfloat)probe.discriminant;
}

// ─────────────────────────────────────────────
// nativeWelfare(t, cost, payload) → float
//
// W = (1-t)*C + t*P
// Welfare metric:
//   t       = time coefficient [0,1]
//   cost    = institutional cost C
//   payload = personal/payload cost P
// ─────────────────────────────────────────────

JNIEXPORT jfloat JNICALL
JNI_DRONE(nativeWelfare)(JNIEnv *env, jclass clazz,
                          jfloat t, jfloat cost, jfloat payload) {
    (void)env; (void)clazz;

    double w = obix_welfare((double)t, (double)cost, (double)payload);

    LOGD("welfare: t=%.3f C=%.3f P=%.3f → W=%.4f", t, cost, payload, (float)w);

    return (jfloat)w;
}

// ============================================================
// MASMIC / MMUKO MAGNETIC MODEL — NSIGIIMainActivity
// Three-pole trident: UCHE(ch0) → EZE(ch1) → OBI(ch2)
// ============================================================

// ─────────────────────────────────────────────
// nativeMagCollapseRatio(extension, force, k) → float
//
// Collapse ratio = extension / (force/k)
// 0.0 = not sent; 1.0 = fully collapsed (received)
// ─────────────────────────────────────────────

JNIEXPORT jfloat JNICALL
JNI_MAIN(nativeMagCollapseRatio)(JNIEnv *env, jclass clazz,
                                  jfloat extension, jfloat force, jfloat k) {
    (void)env; (void)clazz;

    nsigii_spring_t spring;
    spring.extension = (double)extension;
    spring.force     = (double)force;
    spring.stiffness = (double)k;

    double ratio = nsigii_collapse_ratio(&spring);
    LOGD("magCollapseRatio: ext=%.3f F=%.3f K=%.3f → ratio=%.4f",
         extension, force, k, (float)ratio);
    return (jfloat)ratio;
}

// ─────────────────────────────────────────────
// nativeUcheEncode(String content, float force, float stiffness) → boolean
//
// UCHE = Knowledge pole = ch0 = Send Actuator (Bearing 255°)
// Encodes message into magnetic state MAG_STATE_ORIENTED.
// Returns true on success.
// ─────────────────────────────────────────────

JNIEXPORT jboolean JNICALL
JNI_MAIN(nativeUcheEncode)(JNIEnv *env, jclass clazz,
                            jstring content, jfloat force, jfloat stiffness) {
    (void)clazz;

    const char *c_content = (*env)->GetStringUTFChars(env, content, NULL);
    if (!c_content) return JNI_FALSE;

    nsigii_mag_message_t *msg = nsigii_uche_encode(
        c_content, (double)force, (double)stiffness, &g_trident);

    (*env)->ReleaseStringUTFChars(env, content, c_content);

    if (!msg) {
        LOGE("nativeUcheEncode: encode failed");
        return JNI_FALSE;
    }

    LOGI("nativeUcheEncode: %s encoded | F=%.2f K=%.2f | state=%d",
         msg->id, force, stiffness, (int)msg->state);
    free(msg);
    return JNI_TRUE;
}

// ─────────────────────────────────────────────
// nativeEzeControl(extension, force, stiffness) → int
//
// EZE = Leadership pole = ch1 = Transit Actuator (Bearing 29°)
// Returns: 1=YES, 0=NO, -1=MAYBE (MAG_CONSENSUS enum)
// ─────────────────────────────────────────────

JNIEXPORT jint JNICALL
JNI_MAIN(nativeEzeControl)(JNIEnv *env, jclass clazz,
                            jfloat extension, jfloat force, jfloat stiffness) {
    (void)env; (void)clazz;

    // Build a transient message to test transit consensus
    nsigii_mag_message_t msg;
    memset(&msg, 0, sizeof(msg));
    msg.spring.extension = (double)extension;
    msg.spring.force     = (double)force;
    msg.spring.stiffness = (double)stiffness;
    msg.state            = MAG_STATE_ORIENTED;
    strncpy(msg.id, "TRANSIT", sizeof(msg.id) - 1);

    nsigii_mag_consensus_t consensus = nsigii_eze_control(&msg);
    LOGD("nativeEzeControl: ext=%.3f F=%.3f K=%.3f → consensus=%d",
         extension, force, stiffness, (int)consensus);
    return (jint)consensus;
}

// ─────────────────────────────────────────────
// nativeObiReceive(extension, force, stiffness) → boolean
//
// OBI = Heart/Nexus pole = ch2 = Receive Actuator (Bearing 265°)
// AXIOM: collapse = received.
// Returns true if collapse ratio >= 1.0 (fully delivered).
// ─────────────────────────────────────────────

JNIEXPORT jboolean JNICALL
JNI_MAIN(nativeObiReceive)(JNIEnv *env, jclass clazz,
                            jfloat extension, jfloat force, jfloat stiffness) {
    (void)env; (void)clazz;

    nsigii_mag_message_t msg;
    memset(&msg, 0, sizeof(msg));
    msg.spring.extension = (double)extension;
    msg.spring.force     = (double)force;
    msg.spring.stiffness = (double)stiffness;
    msg.state            = MAG_STATE_IN_TRANSIT;
    strncpy(msg.id, "RECEIVE", sizeof(msg.id) - 1);

    nsigii_rights_record_t rights;
    memset(&rights, 0, sizeof(rights));

    bool received = nsigii_obi_receive(&msg, &rights);
    LOGI("nativeObiReceive: received=%s | retrieval_revoked=%s",
         received ? "YES" : "NO",
         rights.sender_retrieval_revoked ? "YES" : "NO");
    return received ? JNI_TRUE : JNI_FALSE;
}

// ─────────────────────────────────────────────
// nativeMagTeleport(String content, float force, float stiffness) → int
//
// Full 6-step ENCODED→SEALED teleportation via UCHE→EZE→OBI.
// Returns MAG_STATE value (5 = SEALED = fully delivered).
// ─────────────────────────────────────────────

JNIEXPORT jint JNICALL
JNI_MAIN(nativeMagTeleport)(JNIEnv *env, jclass clazz,
                             jstring content, jfloat force, jfloat stiffness) {
    (void)clazz;

    const char *c_content = (*env)->GetStringUTFChars(env, content, NULL);
    if (!c_content) return (jint)MAG_STATE_ENCODED;

    nsigii_rights_record_t rights;
    memset(&rights, 0, sizeof(rights));

    nsigii_mag_message_t *msg = nsigii_mag_teleport(
        c_content, (double)force, (double)stiffness, &g_trident, &rights);

    (*env)->ReleaseStringUTFChars(env, content, c_content);

    if (!msg) {
        LOGE("nativeMagTeleport: teleportation failed");
        return (jint)MAG_STATE_ENCODED;
    }

    int final_state = (int)msg->state;
    LOGI("nativeMagTeleport: %s → state=%d | breach=%s",
         msg->id, final_state,
         rights.constitutional_breach ? "YES" : "NO");
    free(msg);
    return (jint)final_state;
}

// ─────────────────────────────────────────────
// JNI_OnLoad — called when library is loaded
// Initialises global MASMIC trident
// ─────────────────────────────────────────────

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *reserved) {
    (void)vm; (void)reserved;

    // Initialise MASMIC trident with UCHE/EZE/OBI bearings
    nsigii_mag_trident_init(&g_trident);

    LOGI("==============================================");
    LOGI("  NSIGII Core JNI v0.2.0 loaded");
    LOGI("  OBINexus Computing — Nnamdi Michael Okpala");
    LOGI("  Constitutional layer:      ACTIVE");
    LOGI("  Filter before Flash:       ENFORCED");
    LOGI("  Suffering encoder:         HOLDING");
    LOGI("  MASMIC/MMUKO trident:      INITIALISED");
    LOGI("  ch0 UCHE (Knowledge):      Bearing %.0f°", BEARING_UCHE);
    LOGI("  ch1 EZE  (Leadership):     Bearing %.0f°", BEARING_EZE);
    LOGI("  ch2 OBI  (Heart/Nexus):    Bearing %.0f°", BEARING_OBI);
    LOGI("  Collapse = Received axiom: ACTIVE");
    LOGI("==============================================");

    return JNI_VERSION_1_6;
}
