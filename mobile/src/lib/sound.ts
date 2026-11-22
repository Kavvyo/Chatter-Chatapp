import { Vibration } from 'react-native';

let vibrationActive = false;

/**
 * Trigger phone call vibration ring cadence when receiving an incoming call.
 * Uses core React Native Vibration which is 100% native and does not depend on
 * deprecated native audio modules in Expo Go SDK 58.
 */
export async function playRingtone() {
  await stopCallSounds();

  try {
    vibrationActive = true;
    // Phone ring vibration pattern: wait 0ms, vibrate 1000ms, pause 1200ms (repeats)
    Vibration.vibrate([0, 1000, 1200, 1000], true);
  } catch {
    // Graceful fallback for devices or environments without vibration hardware
  }
}

/**
 * Immediately cancels the vibration ring pattern when the call is answered, rejected, or ended.
 */
export async function stopCallSounds() {
  if (vibrationActive) {
    try {
      Vibration.cancel();
    } catch {
      // ignore
    }
    vibrationActive = false;
  }
}
