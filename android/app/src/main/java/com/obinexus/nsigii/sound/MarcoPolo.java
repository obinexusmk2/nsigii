package com.obinexus.nsigii.sound;

// ============================================================
// MarcoPolo.java — Sound fires when Dr < threshold
// OBINexus Computing — Nnamdi Michael Okpala
// ============================================================
//
// Marco Polo Protocol:
//   Phone (drone) → TRANSMIT ping via loopback
//   Laptop (base) → RECEIVE ping, VERIFY via Drift Theorem
//   Dr < 0        → approaching → HERE AND NOW → play sound
//
// Sound model:
//   APPROACHING (Dr << 0) → fast bleep — close
//   APPROACHING (Dr < 0)  → slow bleep — coming in
//   ANGULAR drift          → bloop     — lateral movement
//   RETREATING             → silence
//
// "The closer the drone to delivery, the faster the ping."
// ============================================================

import android.content.Context;
import android.media.AudioAttributes;
import android.media.SoundPool;
import android.util.Log;

public class MarcoPolo {

    private static final String TAG = "MarcoPolo";

    public static final float APPROACH_THRESHOLD = 0.5f;   // Dr < -0.5 triggers
    public static final float CLOSE_THRESHOLD    = 2.0f;   // Dr < -2.0 = very close
    public static final float ANGULAR_THRESHOLD  = 0.3f;   // Dω > 0.3 = bloop

    private static final int  MAX_STREAMS        = 4;
    private static final float VOLUME_MAX        = 1.0f;
    private static final float VOLUME_MIN        = 0.2f;

    // Sound IDs (loaded from res/raw/)
    private static final int SOUND_PING  = 1;  // ping.wav  — approach
    private static final int SOUND_BLEEP = 2;  // bleep.wav — close approach
    private static final int SOUND_BLOOP = 3;  // bloop.wav — angular drift

    private final SoundPool soundPool;
    private int pingId, bleepId, bloopId;
    private long lastTriggerMs = 0L;
    private int  minIntervalMs = 500;   // minimum ms between triggers

    public MarcoPolo(Context context) {
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_GAME)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        soundPool = new SoundPool.Builder()
            .setMaxStreams(MAX_STREAMS)
            .setAudioAttributes(attrs)
            .build();

        // Load sounds from res/raw/
        // In production: use soundPool.load(context, R.raw.ping, 1)
        // For now: log that sounds should be loaded
        Log.d(TAG, "MarcoPolo initialized. Load ping/bleep/bloop from res/raw/");
        loadSounds(context);
    }

    private void loadSounds(Context context) {
        // Placeholder — in production connect to R.raw.ping etc.
        // soundPool.setOnLoadCompleteListener((sp, id, status) ->
        //     Log.d(TAG, "Sound loaded id=" + id));
        // pingId  = soundPool.load(context, R.raw.ping,  1);
        // bleepId = soundPool.load(context, R.raw.bleep, 1);
        // bloopId = soundPool.load(context, R.raw.bloop, 1);
        Log.d(TAG, "Sound load hooks registered (connect R.raw.* in production).");
    }

    // ── Main trigger: called from DroneController on drift update ──
    //
    // Dr < 0                  → approaching → ping or bleep
    // |Dr| > CLOSE_THRESHOLD  → very close  → fast bleep (short interval)
    // Dω > ANGULAR_THRESHOLD  → lateral     → bloop
    //
    public void trigger(float drRadial) {
        trigger(drRadial, 0f);
    }

    public void trigger(float drRadial, float dwAngular) {
        long nowMs = System.currentTimeMillis();
        if (nowMs - lastTriggerMs < minIntervalMs) return;

        boolean approaching = drRadial  < -APPROACH_THRESHOLD;
        boolean veryClose   = drRadial  < -CLOSE_THRESHOLD;
        boolean angular     = dwAngular >  ANGULAR_THRESHOLD;

        if (!approaching && !angular) return;  // silence — retreating

        if (angular) {
            playBloop();
            minIntervalMs = 300;
        } else if (veryClose) {
            playBleep();
            minIntervalMs = 100;   // fast ping — almost there
            Log.d(TAG, "MARCO POLO: VERY CLOSE — Dr=" + drRadial + " BLEEP FAST");
        } else {
            playPing();
            // Scale interval: closer = faster ping
            // Dr = -0.5 → 500ms, Dr = -2.0 → 100ms
            float factor  = Math.min(1f, (float)(-drRadial - APPROACH_THRESHOLD) / CLOSE_THRESHOLD);
            minIntervalMs = (int)(500f - factor * 400f);
            Log.d(TAG, "MARCO POLO: APPROACHING — Dr=" + drRadial
                    + " interval=" + minIntervalMs + "ms");
        }

        lastTriggerMs = nowMs;
    }

    private void playPing() {
        // soundPool.play(pingId, VOLUME_MAX, VOLUME_MAX, 0, 0, 1.0f);
        Log.d(TAG, "[PING] — drone approaching");
    }

    private void playBleep() {
        // soundPool.play(bleepId, VOLUME_MAX, VOLUME_MAX, 0, 0, 1.5f);
        Log.d(TAG, "[BLEEP] — drone very close → HERE AND NOW");
    }

    private void playBloop() {
        float vol = Math.min(VOLUME_MAX, 0.5f);
        // soundPool.play(bloopId, vol, vol, 0, 0, 1.0f);
        Log.d(TAG, "[BLOOP] — angular drift detected");
    }

    public void release() {
        soundPool.release();
        Log.d(TAG, "MarcoPolo released.");
    }
}
