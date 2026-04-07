package com.obinexus.nsigii.sensor;

// ============================================================
// DriftSensor.java — Accelerometer → Drift Vector
// OBINexus Computing — Nnamdi Michael Okpala
// ============================================================
//
// Reads phone accelerometer and converts raw sensor data
// into Drift Theorem quantities:
//   V(t) = P(t) - C(t)   relative observation vector
//   Dr   = d(|V|)/dt     radial drift
//   Dω   = dθ/dt         angular drift
//
// Phone movement IS drone movement:
//   Move phone toward laptop → Dr < 0 → APPROACHING
//   Move phone away          → Dr > 0 → RETREATING
//   Move phone sideways      → Dω > 0 → ANGULAR DRIFT
//
// Four color states (from OpenCV live demo):
//   GREEN  → Dr < 0, clean approach
//   ORANGE → Dr < 0 + angular (self-tracking)
//   RED    → Dr > 0 or Dω > threshold
//   BLUE   → still, no drift
// ============================================================

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.util.Log;

public class DriftSensor implements SensorEventListener {

    private static final String TAG = "DriftSensor";

    public static final float THRESHOLD_APPROACH  = 0.5f;   // m/s² Dr threshold
    public static final float THRESHOLD_RETREAT   = 0.5f;
    public static final float THRESHOLD_ANGULAR   = 0.15f;  // rad/s Dω threshold

    public enum DriftColor { GREEN, ORANGE, RED, BLUE }

    public interface DriftCallback {
        void onDriftUpdate(float drRadial, float dwAngular,
                           float x, float y, float z);
    }

    private final SensorManager sensorManager;
    private final Sensor        accelerometer;
    private final DriftCallback callback;

    // Running position (integrated acceleration — prototype approximation)
    private float[] position    = {0f, 0f, 0f};
    private float[] velocity    = {0f, 0f, 0f};
    private float[] prevV       = {0f, 0f, 0f};  // V(t-Δt) for angular
    private float   prevMagnitude = 0f;
    private long    prevTimeNs    = 0L;

    // Derived quantities
    private float   drRadial   = 0f;
    private float   dwAngular  = 0f;
    private DriftColor color   = DriftColor.BLUE;

    public DriftSensor(Context context, DriftCallback callback) {
        this.callback      = callback;
        this.sensorManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        this.accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);

        if (accelerometer == null) {
            Log.w(TAG, "No linear accelerometer — using TYPE_ACCELEROMETER");
        }
    }

    public void start() {
        Sensor s = accelerometer != null
                 ? accelerometer
                 : sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        sensorManager.registerListener(this, s, SensorManager.SENSOR_DELAY_GAME);
        Log.d(TAG, "DriftSensor started.");
    }

    public void stop() {
        sensorManager.unregisterListener(this);
        Log.d(TAG, "DriftSensor stopped.");
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        float ax = event.values[0];  // acceleration x
        float ay = event.values[1];  // acceleration y
        float az = event.values[2];  // acceleration z (depth — approach axis)

        long nowNs = event.timestamp;
        if (prevTimeNs == 0L) {
            prevTimeNs = nowNs;
            return;
        }

        float dt = (nowNs - prevTimeNs) / 1_000_000_000f;  // seconds
        prevTimeNs = nowNs;
        if (dt < 1e-6f) return;

        // Integrate acceleration → velocity → position (prototype)
        // In production: use GPS + IMU fusion
        velocity[0] += ax * dt;
        velocity[1] += ay * dt;
        velocity[2] += az * dt;

        // Apply damping to prevent drift accumulation
        velocity[0] *= 0.95f;
        velocity[1] *= 0.95f;
        velocity[2] *= 0.95f;

        position[0] += velocity[0] * dt;
        position[1] += velocity[1] * dt;
        position[2] += velocity[2] * dt;

        // V(t) = relative observation vector (using phone position as C)
        // For prototype: V = velocity (direction of movement)
        float[] V = {velocity[0], velocity[1], velocity[2]};
        float   magV = magnitude(V);

        // Radial drift: Dr = d(|V|)/dt
        drRadial = (magV - prevMagnitude) / dt;
        prevMagnitude = magV;

        // Angular drift: Dω = dθ/dt
        // θ = angle between V(t) and V(t-Δt)
        float magPrev = magnitude(prevV);
        if (magV > 1e-6f && magPrev > 1e-6f) {
            float dot = dot(V, prevV);
            float cosTheta = dot / (magV * magPrev);
            cosTheta = Math.max(-1f, Math.min(1f, cosTheta));
            float theta = (float) Math.acos(cosTheta);
            dwAngular = theta / dt;
        } else {
            dwAngular = 0f;
        }

        prevV = V.clone();

        // Color classification (from live OpenCV demo)
        color = classify();

        Log.v(TAG, "Dr=" + drRadial + " Dω=" + dwAngular + " color=" + color
                + " pos=(" + position[0] + "," + position[1] + "," + position[2] + ")");

        if (callback != null) {
            callback.onDriftUpdate(drRadial, dwAngular,
                                   position[0], position[1], position[2]);
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    // ── Color classification: 4 states ──
    private DriftColor classify() {
        boolean approaching = drRadial  < -THRESHOLD_APPROACH;
        boolean retreating  = drRadial  >  THRESHOLD_RETREAT;
        boolean angular     = dwAngular >  THRESHOLD_ANGULAR;
        boolean still       = !approaching && !retreating && !angular;

        if (still)                     return DriftColor.BLUE;
        if (approaching && !angular)   return DriftColor.GREEN;
        if (approaching &&  angular)   return DriftColor.ORANGE;
        return DriftColor.RED;         // retreating or pure angular
    }

    // ── Utilities ──
    private static float magnitude(float[] v) {
        return (float) Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    }

    private static float dot(float[] a, float[] b) {
        return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
    }

    // ── Getters ──
    public float      getDrRadial()  { return drRadial; }
    public float      getDwAngular() { return dwAngular; }
    public float[]    getPosition()  { return position.clone(); }
    public DriftColor getColor()     { return color; }
}
