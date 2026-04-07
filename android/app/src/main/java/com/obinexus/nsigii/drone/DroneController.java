package com.obinexus.nsigii.drone;

// ============================================================
// DroneController.java — Phone Movement = Drone Movement
// OBINexus Computing — Nnamdi Michael Okpala
// ============================================================
//
// The phone IS the drone prototype.
// Moving the phone toward the laptop = Dr < 0 = APPROACHING
// Moving the phone away             = Dr > 0 = RETREATING
//
// State machine: IDLE → LOADED → FILTER → FLASH → DONE
// Consensus gate: delivery only when 0b111 reached
//
// Integrates:
//   DriftSensor   → accelerometer → drift vector
//   MarcoPolo     → sound on approach
//   RadarView     → phosphor-green display
//   JNI bridge    → C consensus/drift core
// ============================================================

import android.content.Context;
import android.util.Log;

import com.obinexus.nsigii.sensor.DriftSensor;
import com.obinexus.nsigii.sound.MarcoPolo;

public class DroneController {

    private static final String TAG = "DroneController";

    // ── State Machine (MMUKO PENDING→LOADED→FILTER→FLASH→DONE) ──
    public enum DroneState {
        PENDING,   // packet created, not yet routing
        LOADED,    // drone has packet, navigating
        FILTER,    // orderal verification — consensus check
        FLASH,     // delivery committed — irreversible
        DONE       // delivered
    }

    // ── Resource Types (Maslow Tier 1) ──
    public enum ResourceType {
        FOOD(0), WATER(1), SHELTER(2), WARMTH(3), REST(4);
        public final int code;
        ResourceType(int c) { this.code = c; }
    }

    // ── Consensus (3-bit, from mmuko.h) ──
    public static final int CONSENSUS_NO                       = 0b000;
    public static final int CONSENSUS_MAYBE_HERE_AND_NOW       = 0b001;
    public static final int CONSENSUS_MAYBE_WHEN_AND_WHERE     = 0b010;
    public static final int CONSENSUS_MAYBE_NOT_THERE_AND_THEN = 0b011;
    public static final int CONSENSUS_MAYBE_THERE_AND_THEN     = 0b100;
    public static final int CONSENSUS_MAYBE_NOT_WHEN_AND_WHERE = 0b101;
    public static final int CONSENSUS_MAYBE_NOT_HERE_AND_NOW   = 0b110;
    public static final int CONSENSUS_YES                      = 0b111;

    // ── Core state ──
    private DroneState    state;
    private ResourceType  resource;
    private int           consensus;
    private float         drRadial;      // Dr — radial drift
    private float         dwAngular;     // Dω — angular drift
    private float[]       position;      // [x, y, z] drone position
    private float[]       destination;   // [x, y, z] delivery target
    private float[]       intercept;     // (2/3)P + (1/3)C weighted navigate-to
    private long          packetId;
    private boolean       flashCommitted;

    // ── Subsystems ──
    private final DriftSensor  driftSensor;
    private final MarcoPolo    marcoPolo;
    private final DroneListener listener;

    // ── Suffering formula: Σ = (N-R)×K ──
    private float sigmaSuffering;
    private float needMagnitude;
    private float resourceMagnitude;
    private float constraintK;

    public interface DroneListener {
        void onStateChanged(DroneState newState, int consensus);
        void onMarcoPoloTrigger(float drRadial);
        void onFlash(float[] deliveryPosition, ResourceType resource);
        void onSufferingResolved();  // Σ → 0
    }

    // ── JNI: native C core ──
    static {
        System.loadLibrary("nsigii_core");
    }

    private static native int  nativeReduceConsensus(int here, int when, int there);
    private static native int  nativeNegateConsensus(int consensus);
    private static native float nativeComputeDrift(float px, float py, float pz,
                                                    float cx, float cy, float cz);
    private static native float[] nativeComputeIntercept(float px, float py, float pz,
                                                          float cx, float cy, float cz);
    private static native float  nativeProbeDiscriminant(float a, float b, float c);
    private static native float  nativeWelfare(float t, float cost, float payload);

    public DroneController(Context context, ResourceType resource, DroneListener listener) {
        this.resource       = resource;
        this.listener       = listener;
        this.state          = DroneState.PENDING;
        this.consensus      = CONSENSUS_NO;
        this.position       = new float[]{0, 0, 0};
        this.destination    = new float[]{0, 0, 0};
        this.intercept      = new float[]{0, 0, 0};
        this.packetId       = System.nanoTime();
        this.flashCommitted = false;
        this.sigmaSuffering = Float.MAX_VALUE;
        this.needMagnitude  = 1.0f;
        this.resourceMagnitude = 0.0f;
        this.constraintK    = 1.0f;

        this.driftSensor = new DriftSensor(context, this::onDriftUpdate);
        this.marcoPolo   = new MarcoPolo(context);

        Log.d(TAG, "DroneController initialized. Resource=" + resource
                + " PacketID=" + packetId);
    }

    // ── Start drone session ──
    public void start() {
        driftSensor.start();
        setState(DroneState.LOADED);
        Log.d(TAG, "Drone LOADED. Navigating to delivery.");
    }

    public void stop() {
        driftSensor.stop();
        marcoPolo.release();
        Log.d(TAG, "Drone stopped.");
    }

    // ── Drift update from DriftSensor ──
    private void onDriftUpdate(float drRadial, float dwAngular,
                                float x, float y, float z) {
        this.drRadial   = drRadial;
        this.dwAngular  = dwAngular;
        this.position   = new float[]{x, y, z};

        // Compute weighted intercept W = (2/3)P + (1/3)C
        this.intercept = nativeComputeIntercept(
            destination[0], destination[1], destination[2],
            x, y, z
        );

        // Update consensus based on drift state
        updateConsensus();

        // Marco Polo: approaching threshold
        if (drRadial < -MarcoPolo.APPROACH_THRESHOLD) {
            marcoPolo.trigger(drRadial);
            if (listener != null) listener.onMarcoPoloTrigger(drRadial);
        }

        // Suffering update: Σ = (N - R) × K
        // As drone approaches (Dr < 0), R increases → Σ decreases
        float approachFactor = Math.max(0, -drRadial / 10.0f);
        resourceMagnitude = Math.min(needMagnitude, approachFactor);
        sigmaSuffering    = Math.max(0, (needMagnitude - resourceMagnitude)) * constraintK;

        if (sigmaSuffering < 0.01f && state == DroneState.FILTER) {
            // Suffering resolved — ready to FLASH
            if (listener != null) listener.onSufferingResolved();
        }
    }

    // ── Consensus update ──
    private void updateConsensus() {
        // HERE_AND_NOW: drone is approaching (Dr < 0)
        int hereVote  = (drRadial  < -MarcoPolo.APPROACH_THRESHOLD) ? 3 : 0; // 3=YES
        // WHEN_AND_WHERE: angular drift is small (nearly straight approach)
        int whenVote  = (Math.abs(dwAngular) < 0.1f) ? 3 : 2;               // 2=MAYBE
        // THERE_AND_THEN: suffering is resolving
        int thereVote = (sigmaSuffering < 1.0f) ? 3 : 0;

        consensus = nativeReduceConsensus(hereVote, whenVote, thereVote);
        Log.d(TAG, "Consensus: 0b"
                + Integer.toBinaryString(consensus) + " — " + consensusName(consensus));

        // State machine advancement
        if (state == DroneState.LOADED && consensus != CONSENSUS_NO) {
            setState(DroneState.FILTER);
        }

        // FLASH gate: all three poles must be YES
        if (state == DroneState.FILTER && consensus == CONSENSUS_YES) {
            commitFlash();
        }
    }

    // ── FLASH: irreversible delivery commitment ──
    private void commitFlash() {
        if (flashCommitted) return;
        flashCommitted = true;
        setState(DroneState.FLASH);

        Log.d(TAG, "FLASH COMMITTED — delivery at ("
                + intercept[0] + ", " + intercept[1] + ", " + intercept[2] + ")");
        Log.d(TAG, "Resource: " + resource + " | Σ=" + sigmaSuffering);

        if (listener != null) listener.onFlash(intercept.clone(), resource);
        setState(DroneState.DONE);
    }

    // ── Pole withdrawal (negation law) ──
    public void withdrawPole(int currentConsensus) {
        int negated = nativeNegateConsensus(currentConsensus);
        Log.d(TAG, "Pole withdrawal: 0b"
                + Integer.toBinaryString(currentConsensus)
                + " → 0b" + Integer.toBinaryString(negated));
        this.consensus = negated;
        if (state == DroneState.FILTER) setState(DroneState.LOADED);
    }

    private void setState(DroneState newState) {
        state = newState;
        Log.d(TAG, "State: " + newState + " | Consensus: 0b"
                + Integer.toBinaryString(consensus));
        if (listener != null) listener.onStateChanged(newState, consensus);
    }

    // ── Setters ──
    public void setDestination(float x, float y, float z) {
        destination = new float[]{x, y, z};
        Log.d(TAG, "Destination set: (" + x + ", " + y + ", " + z + ")");
    }

    public void setNeed(float need, float K) {
        this.needMagnitude = need;
        this.constraintK   = K;
        this.sigmaSuffering = (need - resourceMagnitude) * K;
        Log.d(TAG, "Suffering: N=" + need + " K=" + K + " Σ=" + sigmaSuffering);
    }

    // ── Getters ──
    public DroneState getState()    { return state; }
    public int        getConsensus(){ return consensus; }
    public float      getDrRadial() { return drRadial; }
    public float      getSigma()    { return sigmaSuffering; }
    public float[]    getIntercept(){ return intercept.clone(); }
    public ResourceType getResource(){ return resource; }

    private static String consensusName(int c) {
        switch (c) {
            case CONSENSUS_NO:                       return "NO(000)";
            case CONSENSUS_MAYBE_HERE_AND_NOW:       return "MAYBE_HERE(001)";
            case CONSENSUS_MAYBE_WHEN_AND_WHERE:     return "MAYBE_WHEN(010)";
            case CONSENSUS_MAYBE_NOT_THERE_AND_THEN: return "MAYBE_NOT_THERE(011)";
            case CONSENSUS_MAYBE_THERE_AND_THEN:     return "MAYBE_THERE(100)";
            case CONSENSUS_MAYBE_NOT_WHEN_AND_WHERE: return "MAYBE_NOT_WHEN(101)";
            case CONSENSUS_MAYBE_NOT_HERE_AND_NOW:   return "MAYBE_NOT_HERE(110)";
            case CONSENSUS_YES:                      return "YES(111)";
            default:                                 return "UNKNOWN";
        }
    }
}
