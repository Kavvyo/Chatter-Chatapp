import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

interface NativeCallAudioModule {
  startCallAudio(speakerOn: boolean, proximityEnabled: boolean): boolean;
  setSpeakerphoneOn(enabled: boolean): boolean;
  setProximityEnabled(enabled: boolean): boolean;
  stopCallAudio(): boolean;
  playIncomingRingtone(): boolean;
  playOutgoingRingback(): boolean;
  stopRinging(): boolean;
  setScreenshotProtection(enabled: boolean): boolean;
  enterPictureInPicture(widthRatio: number, heightRatio: number): boolean;
  isInPictureInPictureMode(): boolean;
}

const CallAudioNative: NativeCallAudioModule | null =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<NativeCallAudioModule>('CallAudio')
    : null;

/** True when running in a compiled APK/Dev Client with native audio routing & proximity lock. */
export const isNativeCallAudioAvailable = Boolean(CallAudioNative);

export function startCallAudio(speakerOn: boolean, proximityEnabled: boolean) {
  try {
    CallAudioNative?.startCallAudio(speakerOn, proximityEnabled);
  } catch {
    // Safe no-op in Expo Go or unsupported platforms
  }
}

export function setSpeakerphoneOn(enabled: boolean) {
  try {
    CallAudioNative?.setSpeakerphoneOn(enabled);
  } catch {
    // Safe no-op
  }
}

export function setProximityEnabled(enabled: boolean) {
  try {
    CallAudioNative?.setProximityEnabled(enabled);
  } catch {
    // Safe no-op
  }
}

export function stopCallAudio() {
  try {
    CallAudioNative?.stopCallAudio();
  } catch {
    // Safe no-op
  }
}

export function playNativeIncomingRingtone() {
  try {
    CallAudioNative?.playIncomingRingtone?.();
  } catch {
    // Safe fallback
  }
}

export function playNativeOutgoingRingback() {
  try {
    CallAudioNative?.playOutgoingRingback?.();
  } catch {
    // Safe fallback
  }
}

export function stopNativeRinging() {
  try {
    CallAudioNative?.stopRinging?.();
  } catch {
    // Safe fallback
  }
}

export function setScreenshotProtection(enabled: boolean) {
  try {
    CallAudioNative?.setScreenshotProtection?.(enabled);
  } catch {
    // Safe fallback in Expo Go or unsupported platforms
  }
}

export function enterSystemPictureInPicture(widthRatio = 9, heightRatio = 16): boolean {
  try {
    return CallAudioNative?.enterPictureInPicture(widthRatio, heightRatio) ?? false;
  } catch {
    return false;
  }
}

export function isInSystemPictureInPicture(): boolean {
  try {
    return CallAudioNative?.isInPictureInPictureMode() ?? false;
  } catch {
    return false;
  }
}
