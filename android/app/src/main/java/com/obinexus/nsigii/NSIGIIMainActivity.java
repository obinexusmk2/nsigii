package com.obinexus.nsigii;

// ============================================================
// NSIGIIMainActivity.java — NSIGII Android Entry Point
// OBINexus Computing — Nnamdi Michael Okpala
// ============================================================
//
// Magnetic Memory MASMIC Model — MMUKO OS
// Tripartite Consensus Human Rights Protocol
//
// Three-Channel Trident:
//   ch0  UCHE (Knowledge)   — Transmitter — Bearing 255° — Port 8001
//   ch1  EZE  (Leadership)  — Receiver    — Bearing  29° — Port 8002
//   ch2  OBI  (Heart/Nexus) — Verifier    — Bearing 265° — Port 8003
//
// AXIOM: "collapse = received"
// PRINCIPLE: "The machine bears suffering, not the person"
//
// NSIGII is a Human Rights Protocol.
// Food, Water, Shelter — delivered free of charge.
// NOT a weapon. NOT a toy.
//
// JNI native methods:
//   nsigii_jni.c    → MASMIC magnetic model (UCHE/EZE/OBI)
//   polycall_jni.c  → LibPolyCall state machine (PENDING→DONE)
// ============================================================

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;

import com.obinexus.nsigii.drone.DroneController;
import com.obinexus.nsigii.drone.DroneController.DroneState;
import com.obinexus.nsigii.drone.DroneController.ResourceType;
import com.obinexus.nsigii.ui.RadarView;

public class NSIGIIMainActivity extends Activity
        implements DroneController.DroneListener {

    private static final String TAG = "NSIGIIMain";

    // ── MASMIC Magnetic State enum (mirrors nsigii_magnetic.h) ──
    private static final int MAG_STATE_ENCODED    = 0;
    private static final int MAG_STATE_ORIENTED   = 1;
    private static final int MAG_STATE_SENDING    = 2;
    private static final int MAG_STATE_IN_TRANSIT = 3;
    private static final int MAG_STATE_COLLAPSED  = 4;
    private static final int MAG_STATE_SEALED     = 5;

    private static final String[] MAG_STATE_NAMES = {
        "ENCODED", "ORIENTED", "SENDING", "IN_TRANSIT", "COLLAPSED", "SEALED"
    };

    // ── LibPolyCall state IDs (mirrors polycall_jni.c) ──
    private static final int PC_STATE_PENDING = 0;
    private static final int PC_STATE_LOADED  = 1;
    private static final int PC_STATE_FILTER  = 2;
    private static final int PC_STATE_FLASH   = 3;
    private static final int PC_STATE_DONE    = 4;

    // ── UI ──
    private TextView tvState;
    private TextView tvConsensus;
    private TextView tvSuffering;
    private TextView tvMasmic;
    private TextView tvCh0;
    private TextView tvCh1;
    private TextView tvCh2;
    private RadarView radarView;

    // ── Core subsystems ──
    private DroneController droneController;
    private ResourceType    currentResource = ResourceType.FOOD;
    private int             magState        = MAG_STATE_ENCODED;
    private boolean         polycallReady   = false;

    // ── Update handler ──
    private final Handler uiHandler = new Handler(Looper.getMainLooper());
    private final Runnable uiUpdateRunnable = this::updateUI;

    // ============================================================
    // JNI — MASMIC Magnetic Model (nsigii_jni.c)
    // Three-pole trident: UCHE(ch0) → EZE(ch1) → OBI(ch2)
    // ============================================================

    /** Collapse ratio = ext / (F/K). 0.0=not sent; 1.0=collapsed/received */
    private static native float  nativeMagCollapseRatio(float extension,
                                                          float force,
                                                          float stiffness);

    /** UCHE (ch0) — encode message, returns true on success */
    private static native boolean nativeUcheEncode(String content,
                                                    float force,
                                                    float stiffness);

    /** EZE (ch1) — transit control; returns 1=YES, 0=NO, -1=MAYBE */
    private static native int     nativeEzeControl(float extension,
                                                    float force,
                                                    float stiffness);

    /** OBI (ch2) — receive; AXIOM: collapse=received; returns true if ratio>=1 */
    private static native boolean nativeObiReceive(float extension,
                                                    float force,
                                                    float stiffness);

    /** Full 6-step teleport UCHE→EZE→OBI; returns MAG_STATE (5=SEALED) */
    private static native int     nativeMagTeleport(String content,
                                                     float force,
                                                     float stiffness);

    // ============================================================
    // JNI — LibPolyCall State Machine (polycall_jni.c)
    // ============================================================

    private static native boolean nativePolycallInit();
    private static native int     nativePolycallTransition(int toStateId);
    private static native String  nativePolycallGetState();
    private static native int     nativePolycallGetStatus();
    private static native void    nativePolycallReset();

    // ── Load native library ──
    static {
        System.loadLibrary("nsigii_core");
    }

    // ============================================================
    // Activity Lifecycle
    // ============================================================

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        bindViews();
        setupResourceButtons();

        // Initialise LibPolyCall state machine
        polycallReady = nativePolycallInit();
        if (polycallReady) {
            Log.i(TAG, "LibPolyCall state machine initialised — PENDING");
        } else {
            Log.e(TAG, "LibPolyCall state machine FAILED to initialise");
        }

        // Initialise DroneController with default resource FOOD
        initDroneController(ResourceType.FOOD);

        // Start MASMIC magnetic teleportation sequence
        launchMASMICTeleport("FOOD:WELFARE:DELIVERY", 1.0f, 0.67f);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (droneController != null) {
            droneController.start();
        }
        uiHandler.postDelayed(uiUpdateRunnable, 500);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (droneController != null) {
            droneController.stop();
        }
        uiHandler.removeCallbacks(uiUpdateRunnable);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (droneController != null) {
            droneController.stop();
        }
    }

    // ============================================================
    // UI Binding
    // ============================================================

    private void bindViews() {
        tvState     = findViewById(R.id.tv_state);
        tvConsensus = findViewById(R.id.tv_consensus);
        tvSuffering = findViewById(R.id.tv_suffering);
        tvMasmic    = findViewById(R.id.tv_masmic);
        tvCh0       = findViewById(R.id.tv_ch0_status);
        tvCh1       = findViewById(R.id.tv_ch1_status);
        tvCh2       = findViewById(R.id.tv_ch2_status);
        radarView   = findViewById(R.id.radar_view);
    }

    private void setupResourceButtons() {
        Button btnFood    = findViewById(R.id.btn_food);
        Button btnWater   = findViewById(R.id.btn_water);
        Button btnShelter = findViewById(R.id.btn_shelter);

        btnFood.setOnClickListener(v -> switchResource(ResourceType.FOOD));
        btnWater.setOnClickListener(v -> switchResource(ResourceType.WATER));
        btnShelter.setOnClickListener(v -> switchResource(ResourceType.SHELTER));
    }

    private void switchResource(ResourceType resource) {
        if (resource == currentResource) return;
        currentResource = resource;
        if (droneController != null) droneController.stop();
        initDroneController(resource);
        droneController.start();
        Log.i(TAG, "Resource switched to: " + resource);

        // Reset polycall state machine for new delivery cycle
        if (polycallReady) {
            nativePolycallReset();
        }

        // Restart MASMIC teleportation for new resource
        launchMASMICTeleport(resource.name() + ":WELFARE:DELIVERY", 1.0f, 0.67f);
    }

    private void initDroneController(ResourceType resource) {
        droneController = new DroneController(this, resource, this);
        droneController.setDestination(0f, 0f, 10f);
        droneController.setNeed(1.0f, 1.0f);
    }

    // ============================================================
    // MASMIC Magnetic Model — 6-Step Teleportation
    // UCHE(ch0) → EZE(ch1) → OBI(ch2)
    // ============================================================

    private void launchMASMICTeleport(final String content,
                                       final float force,
                                       final float stiffness) {
        new Thread(() -> {
            Log.i(TAG, "[MASMIC] Beginning 6-step teleportation: " + content);

            // Step 1-2: UCHE encodes (ch0 — Knowledge — Bearing 255°)
            boolean encoded = nativeUcheEncode(content, force, stiffness);
            if (!encoded) {
                Log.e(TAG, "[MASMIC] UCHE encode failed");
                return;
            }
            updateMagState(MAG_STATE_ORIENTED);

            // Step 3-4: EZE controls transit (ch1 — Leadership — Bearing 29°)
            float fullExt = force / stiffness;
            int ezeConsensus = nativeEzeControl(fullExt, force, stiffness);
            if (ezeConsensus == 0) {
                Log.e(TAG, "[MASMIC] EZE transit refused — NO");
                return;
            }
            if (ezeConsensus == -1) {
                Log.w(TAG, "[MASMIC] EZE returned MAYBE — constitutional deadlock risk");
            }
            updateMagState(MAG_STATE_IN_TRANSIT);

            // Step 5-6: OBI receives — AXIOM: collapse = received
            //           (ch2 — Heart/Nexus — Bearing 265°)
            float collapseRatio = nativeMagCollapseRatio(fullExt, force, stiffness);
            boolean received = nativeObiReceive(fullExt, force, stiffness);
            if (!received) {
                Log.e(TAG, "[MASMIC] OBI receive failed — ratio=" + collapseRatio);
                return;
            }
            updateMagState(MAG_STATE_SEALED);

            Log.i(TAG, "[MASMIC] Teleportation SEALED | " + content
                    + " | ratio=" + collapseRatio);

            // Advance LibPolyCall to LOADED after successful MASMIC seal
            if (polycallReady) {
                nativePolycallTransition(PC_STATE_LOADED);
                Log.i(TAG, "[POLYCALL] → LOADED");
            }
        }).start();
    }

    private void updateMagState(final int state) {
        magState = state;
        String label = (state >= 0 && state < MAG_STATE_NAMES.length)
                ? MAG_STATE_NAMES[state] : "UNKNOWN";
        Log.d(TAG, "[MASMIC] State → " + label);
        uiHandler.post(() -> {
            if (tvMasmic != null) tvMasmic.setText("MASMIC: " + label);
        });
    }

    // ============================================================
    // DroneController.DroneListener — Callbacks
    // ============================================================

    @Override
    public void onStateChanged(DroneState newState, int consensus) {
        Log.d(TAG, "State: " + newState + " | Consensus: 0b"
                + Integer.toBinaryString(consensus));

        // Mirror drone state into LibPolyCall state machine
        if (polycallReady) {
            int pcTarget = droneStateToPcState(newState);
            if (pcTarget >= 0) {
                int status = nativePolycallTransition(pcTarget);
                Log.d(TAG, "[POLYCALL] transition → " + newState
                        + " status=" + status);
            }
        }

        uiHandler.post(this::updateUI);
    }

    @Override
    public void onMarcoPoloTrigger(float drRadial) {
        Log.d(TAG, "Marco Polo: Dr=" + drRadial);
        if (radarView != null) radarView.pulse();
    }

    @Override
    public void onFlash(float[] deliveryPosition, ResourceType resource) {
        Log.i(TAG, "FLASH COMMITTED: " + resource
                + " at (" + deliveryPosition[0]
                + ", " + deliveryPosition[1]
                + ", " + deliveryPosition[2] + ")");
        updateMagState(MAG_STATE_SEALED);
    }

    @Override
    public void onSufferingResolved() {
        Log.i(TAG, "Σ → 0: suffering resolved. Machine held it, not the person.");
        uiHandler.post(() -> {
            if (tvSuffering != null) {
                tvSuffering.setText("Σ = 0 ✓");
                tvSuffering.setTextColor(0xFF4CAF50);
            }
        });
    }

    // ============================================================
    // UI Update
    // ============================================================

    private void updateUI() {
        if (droneController == null) return;

        DroneState state    = droneController.getState();
        int        consensus = droneController.getConsensus();
        float      sigma    = droneController.getSigma();
        float      dr       = droneController.getDrRadial();

        // State display
        if (tvState != null) {
            tvState.setText("STATE: " + state.name());
            int color = stateToColor(state);
            tvState.setTextColor(color);
        }

        // Consensus display
        if (tvConsensus != null) {
            tvConsensus.setText("Consensus: 0b"
                    + String.format("%3s", Integer.toBinaryString(consensus))
                           .replace(' ', '0')
                    + (consensus == 0b111 ? " — YES ✓" : ""));
        }

        // Suffering
        if (tvSuffering != null && sigma > 0.01f) {
            tvSuffering.setText(String.format("Σ = %.3f", sigma));
            tvSuffering.setTextColor(0xFFFF5252);
        }

        // Channel status indicators
        updateChannelStatus(dr);

        // PolycallState
        if (polycallReady && tvMasmic != null) {
            String pcState = nativePolycallGetState();
            String magLabel = (magState >= 0 && magState < MAG_STATE_NAMES.length)
                    ? MAG_STATE_NAMES[magState] : "?";
            tvMasmic.setText("PC:" + pcState + " MAG:" + magLabel);
        }

        // Radar
        if (radarView != null) {
            radarView.update(dr, 0f, consensus);
            radarView.setDroneState(state);
        }

        uiHandler.postDelayed(uiUpdateRunnable, 250);
    }

    private void updateChannelStatus(float dr) {
        if (tvCh0 != null) {
            tvCh0.setText("ch0\nUCHE\n255°\n"
                    + (dr < -0.1f ? "TX >" : "IDLE"));
        }
        if (tvCh1 != null) {
            tvCh1.setText("ch1\nEZE\n29°\n"
                    + (droneController.getState() == DroneState.LOADED ? "RX <" : "IDLE"));
        }
        if (tvCh2 != null) {
            boolean verifying = droneController.getState() == DroneState.FILTER
                             || droneController.getState() == DroneState.FLASH;
            tvCh2.setText("ch2\nOBI\n265°\n"
                    + (verifying ? "VFY ✓" : "WAIT"));
        }
    }

    private static int stateToColor(DroneState state) {
        switch (state) {
            case PENDING:  return 0xFFCCCCCC;
            case LOADED:   return 0xFF4FC3F7;
            case FILTER:   return 0xFFFFB300;
            case FLASH:    return 0xFFFF5252;
            case DONE:     return 0xFF4CAF50;
            default:       return 0xFF39FF14;
        }
    }

    private static int droneStateToPcState(DroneState state) {
        switch (state) {
            case PENDING: return PC_STATE_PENDING;
            case LOADED:  return PC_STATE_LOADED;
            case FILTER:  return PC_STATE_FILTER;
            case FLASH:   return PC_STATE_FLASH;
            case DONE:    return PC_STATE_DONE;
            default:      return -1;
        }
    }
}
