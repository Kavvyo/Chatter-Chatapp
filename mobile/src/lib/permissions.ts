import { PermissionsAndroid, Platform } from 'react-native';

export interface CallPermissionResult {
  granted: boolean;
  missing: string[];
  neverAskAgain: boolean;
}

/**
 * Checks and prompts the user for camera and microphone permissions on mobile devices.
 * Uses React Native core PermissionsAndroid which works in both Expo Go and standalone builds.
 */
export async function requestCallPermissions(
  callType: 'voice' | 'video' = 'video'
): Promise<CallPermissionResult> {
  if (Platform.OS !== 'android') {
    // iOS prompts automatically via system AVFoundation when camera/mic is accessed
    return { granted: true, missing: [], neverAskAgain: false };
  }

  try {
    const permissions: any[] = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    if (callType === 'video') {
      permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    }

    // Check current granted state first to avoid redundant system popups
    const hasAudio = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    const hasCamera =
      callType === 'video'
        ? await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA)
        : true;

    if (hasAudio && hasCamera) {
      return { granted: true, missing: [], neverAskAgain: false };
    }

    // Prompt the native Android OS permissions dialog
    const results = await PermissionsAndroid.requestMultiple(permissions);

    const missing: string[] = [];
    let neverAskAgain = false;

    const audioStatus = results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    if (audioStatus !== PermissionsAndroid.RESULTS.GRANTED) {
      missing.push('Microphone');
      if (audioStatus === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        neverAskAgain = true;
      }
    }

    if (callType === 'video') {
      const cameraStatus = results[PermissionsAndroid.PERMISSIONS.CAMERA];
      if (cameraStatus !== PermissionsAndroid.RESULTS.GRANTED) {
        missing.push('Camera');
        if (cameraStatus === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
          neverAskAgain = true;
        }
      }
    }

    return {
      granted: missing.length === 0,
      missing,
      neverAskAgain,
    };
  } catch (error) {
    console.warn('Error requesting call permissions:', error);
    return { granted: false, missing: ['Microphone', 'Camera'], neverAskAgain: false };
  }
}
