// Audio synthesizer for incoming ringtone and outgoing ringback tone using Web Audio API

let audioCtx = null;
let ringtoneInterval = null;
let outgoingInterval = null;
let originalTitle = typeof document !== "undefined" ? document.title : "Chat App";

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playIncomingRingtone() {
  stopCallSounds();
  const ctx = getAudioContext();

  if (typeof document !== "undefined") {
    originalTitle = document.title;
    document.title = "📞 Incoming Call...";
  }

  // Trigger vibration pattern on supported mobile devices
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate([400, 250, 400, 250, 600]);
    } catch {
      // Ignore vibration error
    }
  }

  if (!ctx) return;

  const playChime = () => {
    try {
      const now = ctx.currentTime;
      // Melodic chime: E5 (659Hz) -> G#5 (830Hz) -> B5 (988Hz) -> E6 (1318Hz)
      const freqs = [659.25, 830.61, 987.77, 1318.51];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        gain.gain.setValueAtTime(0, now + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.38);
      });
    } catch (e) {
      console.warn("Ringtone error", e);
    }
  };

  playChime();
  ringtoneInterval = setInterval(playChime, 2200);
}

export function playOutgoingRingback() {
  stopCallSounds();
  const ctx = getAudioContext();
  if (!ctx) return;

  const playBeep = () => {
    try {
      const now = ctx.currentTime;
      // Dual tone 440Hz + 480Hz phone ringing cadence
      [440, 480].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.04);
        gain.gain.setValueAtTime(0.08, now + 1.2);
        gain.gain.linearRampToValueAtTime(0.001, now + 1.3);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 1.35);
      });
    } catch (e) {
      console.warn("Ringback error", e);
    }
  };

  playBeep();
  outgoingInterval = setInterval(playBeep, 3500);
}

export function playEndCallTone() {
  stopCallSounds();
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.25);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  } catch {
    // Ignore audio error
  }
}

export function stopCallSounds() {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
  if (outgoingInterval) {
    clearInterval(outgoingInterval);
    outgoingInterval = null;
  }
  if (typeof document !== "undefined") {
    document.title = originalTitle;
  }
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate(0);
    } catch {
      // Ignore vibration error
    }
  }
}
