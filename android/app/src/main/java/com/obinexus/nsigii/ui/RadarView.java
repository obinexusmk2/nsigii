package com.obinexus.nsigii.ui;

// ============================================================
// RadarView.java — Phosphor-Green Radar on Screen
// OBINexus Computing — Nnamdi Michael Okpala
// ============================================================
//
// Renders the NSIGII radar scope on the phone screen.
// Matches the Python nsigii_radar_scope.py phosphor CRT aesthetic.
//
// Display elements:
//   - Phosphor-green circular radar grid
//   - Rotating sweep arm
//   - DriftCarcass objects (tracked drift events)
//   - Colour-coded drone position (GREEN/ORANGE/RED/BLUE)
//   - Consensus state ring (0b000 → 0b111)
//   - Suffering meter (Σ bar)
//   - HERE AND NOW indicator (flashes on Marco Polo trigger)
//
// ObixState colour map (from nsigii.h):
//   IDLE    (0) → GREEN
//   WARNING (1) → YELLOW/ORANGE
//   DANGER  (2) → RED
// ============================================================

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.util.Log;
import android.view.View;

import java.util.ArrayList;
import java.util.List;

import com.obinexus.nsigii.drone.DroneController;
import com.obinexus.nsigii.sensor.DriftSensor;

public class RadarView extends View {

    private static final String TAG = "RadarView";

    // ── Phosphor CRT colours ──
    private static final int COLOR_PHOSPHOR     = 0xFF00FF41;  // #00FF41 matrix green
    private static final int COLOR_PHOSPHOR_DIM = 0x4400FF41;  // dim phosphor trail
    private static final int COLOR_BG           = 0xFF000000;  // black
    private static final int COLOR_GREEN        = 0xFF00FF41;
    private static final int COLOR_ORANGE       = 0xFFFF8C00;
    private static final int COLOR_RED          = 0xFFFF2020;
    private static final int COLOR_BLUE         = 0xFF2080FF;
    private static final int COLOR_YELLOW       = 0xFFFFDD00;
    private static final int COLOR_WHITE        = 0xFFFFFFFF;

    // ── DriftCarcass: a detected drift event on the radar ──
    public static class DriftCarcass {
        public float   angle;      // degrees from north
        public float   distance;   // normalised [0,1] from centre
        public float   dr;         // radial drift magnitude
        public float   dw;         // angular drift magnitude
        public int     color;      // GREEN/ORANGE/RED/BLUE
        public long    birthMs;    // when detected
        public float   alpha;      // fade [0,1]

        public DriftCarcass(float angle, float distance, float dr, float dw, int color) {
            this.angle    = angle;
            this.distance = distance;
            this.dr       = dr;
            this.dw       = dw;
            this.color    = color;
            this.birthMs  = System.currentTimeMillis();
            this.alpha    = 1.0f;
        }
    }

    // ── State ──
    private float  sweepAngle    = 0f;    // rotating sweep arm
    private float  drRadial      = 0f;
    private float  dwAngular     = 0f;
    private int    consensus     = 0;     // 0b000 to 0b111
    private float  sigma         = Float.MAX_VALUE;  // suffering Σ
    private boolean marcoTriggered = false;
    private DriftSensor.DriftColor driftColor = DriftSensor.DriftColor.BLUE;
    private DroneController.DroneState droneState = DroneController.DroneState.PENDING;

    private final List<DriftCarcass> carcasses = new ArrayList<>();
    private static final int   MAX_CARCASSES = 32;
    private static final long  CARCASS_TTL_MS = 3000;

    // ── Paints ──
    private final Paint gridPaint   = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint sweepPaint  = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint dronePaint  = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textPaint   = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint sigmaPaint  = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint marcoFlash  = new Paint(Paint.ANTI_ALIAS_FLAG);

    public RadarView(Context context) { super(context); init(); }
    public RadarView(Context context, AttributeSet attrs) { super(context, attrs); init(); }
    public RadarView(Context context, AttributeSet attrs, int defStyle) {
        super(context, attrs, defStyle); init();
    }

    private void init() {
        setBackgroundColor(COLOR_BG);

        gridPaint.setColor(COLOR_PHOSPHOR_DIM);
        gridPaint.setStyle(Paint.Style.STROKE);
        gridPaint.setStrokeWidth(1f);

        sweepPaint.setColor(COLOR_PHOSPHOR);
        sweepPaint.setStyle(Paint.Style.STROKE);
        sweepPaint.setStrokeWidth(2f);
        sweepPaint.setAlpha(180);

        dronePaint.setStyle(Paint.Style.FILL);
        dronePaint.setStrokeWidth(3f);

        textPaint.setColor(COLOR_PHOSPHOR);
        textPaint.setTextSize(28f);

        sigmaPaint.setStyle(Paint.Style.FILL);
        sigmaPaint.setColor(COLOR_RED);

        marcoFlash.setStyle(Paint.Style.STROKE);
        marcoFlash.setStrokeWidth(4f);
        marcoFlash.setColor(COLOR_WHITE);

        Log.d(TAG, "RadarView initialized.");
    }

    // ── Update from DroneController ──
    public void update(float drRadial, float dwAngular,
                       DriftSensor.DriftColor color, int consensus, float sigma) {
        this.drRadial   = drRadial;
        this.dwAngular  = dwAngular;
        this.driftColor = color;
        this.consensus  = consensus;
        this.sigma      = sigma;

        // Spawn DriftCarcass on significant drift
        if (Math.abs(drRadial) > 0.5f || Math.abs(dwAngular) > 0.1f) {
            spawnCarcass();
        }

        invalidate();  // redraw
    }

    /** Simplified update from NSIGIIMainActivity (no DriftColor needed) */
    public void update(float drRadial, float dwAngular, int consensus) {
        update(drRadial, dwAngular, DriftSensor.DriftColor.BLUE, consensus, Float.MAX_VALUE);
    }

    /** Pulse flash — Marco Polo approach trigger */
    public void pulse() {
        setMarcoTriggered(true);
        postDelayed(() -> setMarcoTriggered(false), 300);
    }

    public void setDroneState(DroneController.DroneState state) {
        this.droneState = state;
        invalidate();
    }

    public void setMarcoTriggered(boolean triggered) {
        this.marcoTriggered = triggered;
        invalidate();
    }

    // ── Spawn a DriftCarcass object ──
    private void spawnCarcass() {
        if (carcasses.size() >= MAX_CARCASSES) {
            carcasses.remove(0);
        }

        // Position on radar: angle from Dr/Dω, distance from magnitude
        float angle    = (float)(Math.toDegrees(Math.atan2(dwAngular, -drRadial)));
        float distance = Math.min(1f, (float) Math.sqrt(drRadial*drRadial
                                                        + dwAngular*dwAngular) / 3f);
        int   color    = colorForDrift(driftColor);

        carcasses.add(new DriftCarcass(angle, distance, drRadial, dwAngular, color));
    }

    // ── Main draw ──
    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);

        float cx = getWidth()  / 2f;
        float cy = getHeight() / 2f;
        float r  = Math.min(cx, cy) * 0.85f;

        drawGrid(canvas, cx, cy, r);
        drawSweep(canvas, cx, cy, r);
        drawCarcasses(canvas, cx, cy, r);
        drawDroneMarker(canvas, cx, cy, r);
        drawConsensusRing(canvas, cx, cy, r);
        drawSuffering(canvas, cx, cy, r);
        drawHUD(canvas);
        if (marcoTriggered) drawMarcoFlash(canvas, cx, cy, r);

        // Advance sweep
        sweepAngle = (sweepAngle + 1.5f) % 360f;
        postInvalidateDelayed(16);  // ~60fps
    }

    // ── Grid: concentric circles + crosshairs ──
    private void drawGrid(Canvas canvas, float cx, float cy, float r) {
        gridPaint.setColor(COLOR_PHOSPHOR_DIM);

        // Concentric rings at 25%, 50%, 75%, 100%
        for (float frac : new float[]{0.25f, 0.5f, 0.75f, 1.0f}) {
            canvas.drawCircle(cx, cy, r * frac, gridPaint);
        }

        // Crosshairs
        canvas.drawLine(cx - r, cy, cx + r, cy, gridPaint);
        canvas.drawLine(cx, cy - r, cx, cy + r, gridPaint);

        // Diagonal guides
        float d = r * 0.707f;
        canvas.drawLine(cx - d, cy - d, cx + d, cy + d, gridPaint);
        canvas.drawLine(cx + d, cy - d, cx - d, cy + d, gridPaint);

        // Compass labels
        textPaint.setTextSize(22f);
        textPaint.setColor(COLOR_PHOSPHOR_DIM);
        canvas.drawText("N",  cx - 8f, cy - r - 8f, textPaint);
        canvas.drawText("S",  cx - 8f, cy + r + 22f, textPaint);
        canvas.drawText("E",  cx + r + 8f, cy + 8f,  textPaint);
        canvas.drawText("W",  cx - r - 28f, cy + 8f, textPaint);
    }

    // ── Rotating sweep arm ──
    private void drawSweep(Canvas canvas, float cx, float cy, float r) {
        sweepPaint.setColor(COLOR_PHOSPHOR);
        sweepPaint.setAlpha(220);

        double rad = Math.toRadians(sweepAngle);
        float  ex  = cx + r * (float) Math.sin(rad);
        float  ey  = cy - r * (float) Math.cos(rad);
        canvas.drawLine(cx, cy, ex, ey, sweepPaint);

        // Trailing glow arc
        RectF oval = new RectF(cx - r, cy - r, cx + r, cy + r);
        sweepPaint.setAlpha(60);
        canvas.drawArc(oval, sweepAngle - 90 - 30, 30, false, sweepPaint);
    }

    // ── DriftCarcass objects ──
    private void drawCarcasses(Canvas canvas, float cx, float cy, float r) {
        long now = System.currentTimeMillis();
        List<DriftCarcass> dead = new ArrayList<>();

        for (DriftCarcass dc : carcasses) {
            long age = now - dc.birthMs;
            if (age > CARCASS_TTL_MS) { dead.add(dc); continue; }

            dc.alpha = 1f - (float) age / CARCASS_TTL_MS;

            double rad = Math.toRadians(dc.angle - 90f);
            float  px  = cx + dc.distance * r * (float) Math.cos(rad);
            float  py  = cy + dc.distance * r * (float) Math.sin(rad);

            dronePaint.setColor(dc.color);
            dronePaint.setAlpha((int)(dc.alpha * 255));
            canvas.drawCircle(px, py, 6f, dronePaint);
        }

        carcasses.removeAll(dead);
    }

    // ── Drone marker at centre (self-referential) ──
    private void drawDroneMarker(Canvas canvas, float cx, float cy, float r) {
        int markerColor = colorForDrift(driftColor);
        dronePaint.setColor(markerColor);
        dronePaint.setAlpha(255);

        // Pulsing circle — size reflects Dr magnitude
        float pulse = 18f + Math.min(20f, Math.abs(drRadial) * 6f);
        canvas.drawCircle(cx, cy, pulse, dronePaint);

        // Cross at centre
        dronePaint.setColor(COLOR_BG);
        canvas.drawLine(cx - 10, cy, cx + 10, cy, dronePaint);
        canvas.drawLine(cx, cy - 10, cx, cy + 10, dronePaint);
    }

    // ── Consensus ring: shows 0b000→0b111 visually ──
    private void drawConsensusRing(Canvas canvas, float cx, float cy, float r) {
        RectF ring = new RectF(cx - r - 20, cy - r - 20, cx + r + 20, cy + r + 20);
        float arcPerPole = 90f;  // 3 poles = 270° total, 30° gap

        // bit0 = HERE (top-right arc)
        drawPoleArc(canvas, ring, -90f, arcPerPole,
                    (consensus & 0b001) != 0 ? COLOR_GREEN : COLOR_PHOSPHOR_DIM);
        // bit1 = WHEN (right arc)
        drawPoleArc(canvas, ring, 30f, arcPerPole,
                    (consensus & 0b010) != 0 ? COLOR_YELLOW : COLOR_PHOSPHOR_DIM);
        // bit2 = THERE (bottom arc)
        drawPoleArc(canvas, ring, 150f, arcPerPole,
                    (consensus & 0b100) != 0 ? COLOR_ORANGE : COLOR_PHOSPHOR_DIM);
    }

    private void drawPoleArc(Canvas canvas, RectF bounds,
                              float start, float sweep, int color) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(6f);
        p.setColor(color);
        canvas.drawArc(bounds, start, sweep, false, p);
    }

    // ── Suffering bar: Σ = (N-R)×K ──
    private void drawSuffering(Canvas canvas, float cx, float cy, float r) {
        float barW  = 160f;
        float barH  = 12f;
        float barX  = cx - barW / 2f;
        float barY  = cy + r + 30f;

        // Background
        Paint bg = new Paint();
        bg.setColor(0xFF222222);
        canvas.drawRect(barX, barY, barX + barW, barY + barH, bg);

        // Filled portion: lower sigma = more green, higher = more red
        float filled = sigma >= Float.MAX_VALUE ? barW
                     : Math.min(barW, sigma * barW / 10f);
        int sigColor = sigma < 1f ? COLOR_GREEN : sigma < 5f ? COLOR_YELLOW : COLOR_RED;
        sigmaPaint.setColor(sigColor);
        canvas.drawRect(barX, barY, barX + filled, barY + barH, sigmaPaint);

        textPaint.setTextSize(20f);
        textPaint.setColor(COLOR_PHOSPHOR);
        canvas.drawText("Σ=" + (sigma >= Float.MAX_VALUE ? "∞"
                        : String.format("%.2f", sigma)),
                        barX, barY - 4f, textPaint);
    }

    // ── HUD: state labels ──
    private void drawHUD(Canvas canvas) {
        textPaint.setTextSize(26f);
        textPaint.setColor(COLOR_PHOSPHOR);

        canvas.drawText("STATE: " + droneState.name(), 20f, 40f, textPaint);
        canvas.drawText("Dr=" + String.format("%.3f", drRadial)
                       + "  Dω=" + String.format("%.3f", dwAngular), 20f, 72f, textPaint);

        String cName = consensusLabel(consensus);
        int    cColor = consensus == DroneController.CONSENSUS_YES ? COLOR_GREEN : COLOR_PHOSPHOR;
        textPaint.setColor(cColor);
        canvas.drawText("CONSENSUS: 0b"
                       + String.format("%3s", Integer.toBinaryString(consensus)).replace(' ','0')
                       + " " + cName, 20f, 104f, textPaint);
    }

    // ── Marco Polo flash ──
    private void drawMarcoFlash(Canvas canvas, float cx, float cy, float r) {
        marcoFlash.setColor(COLOR_WHITE);
        marcoFlash.setAlpha(200);
        canvas.drawCircle(cx, cy, r * 0.3f, marcoFlash);

        textPaint.setColor(COLOR_WHITE);
        textPaint.setTextSize(32f);
        canvas.drawText("HERE AND NOW", cx - 100f, cy - r * 0.5f, textPaint);
    }

    // ── Utilities ──
    private static int colorForDrift(DriftSensor.DriftColor c) {
        switch (c) {
            case GREEN:  return COLOR_GREEN;
            case ORANGE: return COLOR_ORANGE;
            case RED:    return COLOR_RED;
            case BLUE:   return COLOR_BLUE;
            default:     return COLOR_PHOSPHOR;
        }
    }

    private static String consensusLabel(int c) {
        switch (c) {
            case DroneController.CONSENSUS_YES:                      return "YES";
            case DroneController.CONSENSUS_MAYBE_HERE_AND_NOW:       return "MAYBE_HERE";
            case DroneController.CONSENSUS_MAYBE_WHEN_AND_WHERE:     return "MAYBE_WHEN";
            case DroneController.CONSENSUS_MAYBE_THERE_AND_THEN:     return "MAYBE_THERE";
            case DroneController.CONSENSUS_MAYBE_NOT_HERE_AND_NOW:   return "MAYBE_NOT_HERE";
            case DroneController.CONSENSUS_MAYBE_NOT_WHEN_AND_WHERE: return "MAYBE_NOT_WHEN";
            case DroneController.CONSENSUS_MAYBE_NOT_THERE_AND_THEN: return "MAYBE_NOT_THERE";
            default:                                                  return "NO";
        }
    }
}
