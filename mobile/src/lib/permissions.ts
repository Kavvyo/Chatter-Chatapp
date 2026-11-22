import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Checks and prompts the user for camera and microphone permissions on mobile devices.
 * Uses React Native core PermissionsAndroid which is 100% native and supported inside Expo Go.
 */
export async function requestCallPermissions(
  callType: 'voice' | 'video' = 'video'
): Promise<{ granted: boolean; missing: string[] }> {
  if (Platform.OS !== 'android') {
    // iOS prompts automatically via system AVFoundation when camera/mic is accessed
    return { granted: true, missing: [] };
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
      return { granted: true, missing: [] };
    }

    // Prompt the native Android OS permissions dialog
    const results = await PermissionsAndroid.requestMultiple(permissions);

    const missing: string[] = [];
    if (results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] !== PermissionsAndroid.RESULTS.GRANTED) {
      missing.push('Microphone');
    }
    if (
      callType === 'video' &&
      results[PermissionsAndroid.PERMISSIONS.CAMERA] !== PermissionsAndroid.RESULTS.GRANTED
    ) {
      missing.push('Camera');
    }

    return {
      granted: missing.length === 0,
      missing,
    };
  } catch (error) {
    console.warn('Error requesting call permissions:', error);
    return { granted: false, missing: ['Microphone', 'Camera'] };
  }
}
