import { Vibration } from 'react-native';

let soundInstance: any = null;
let vibrationActive = false;

// Safe dynamic accessor for Audio module so it doesn't crash Expo Go SDK 58
function getAudioModule() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const expoAv = require('expo-av');
    return expoAv?.Audio || null;
  } catch {
    // ExponentAV native binary is not available in Expo Go SDK 58
    return null;
  }
}

// Ringtone URL
const RINGTONE_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

export async function playRingtone() {
  await stopCallSounds();

  // 1. Trigger native vibration ring pattern on Android
  try {
    vibrationActive = true;
    // Pattern: wait 0ms, vibrate 600ms, pause 1000ms, vibrate 600ms (repeat)
    Vibration.vibrate([0, 600, 1000, 600], true);
  } catch {
    // ignore if device has no vibration support
  }

  // 2. Play audio ringtone if native audio engine is available
  try {
    const Audio = getAudioModule();
    if (Audio) {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: RINGTONE_URL },
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      soundInstance = sound;
    }
  } catch {
    // If audio engine fails or is unavailable in Expo Go, vibration remains active
  }
}

export async function stopCallSounds() {
  if (vibrationActive) {
    try {
      Vibration.cancel();
    } catch {
      // ignore
    }
    vibrationActive = false;
  }

  if (soundInstance) {
    try {
      await soundInstance.stopAsync();
      await soundInstance.unloadAsync();
    } catch {
      // ignore
    }
    soundInstance = null;
  }
}
