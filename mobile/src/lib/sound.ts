import { Vibration } from 'react-native';
import {
  playNativeIncomingRingtone,
  playNativeOutgoingRingback,
  stopNativeRinging,
} from './callAudio';

let vibrationActive = false;

/**
 * Play device ringtone audio + vibration cadence when receiving an incoming call.
 */
export async function playRingtone() {
  await stopCallSounds();

  playNativeIncomingRingtone();
  try {
    vibrationActive = true;
    // Phone ring vibration pattern: wait 0ms, vibrate 1000ms, pause 1200ms (repeats)
    Vibration.vibrate([0, 1000, 1200, 1000], true);
  } catch {
    // Graceful fallback for devices without vibration hardware
  }
}

/**
 * Play dual-tone telephone ringback while awaiting callee pickup.
 */
export async function playOutgoingRingback() {
  await stopCallSounds();
  playNativeOutgoingRingback();
}

/**
 * Immediately stops all ringtone audio, outgoing ringback, and vibration.
 */
export async function stopCallSounds() {
  stopNativeRinging();
  if (vibrationActive) {
    try {
      Vibration.cancel();
    } catch {
      // ignore
    }
    vibrationActive = false;
  }
}
