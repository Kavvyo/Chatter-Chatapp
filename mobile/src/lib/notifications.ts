import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { axiosInstance } from './axios';

export const INCOMING_CALL_CHANNEL_ID = 'incoming_calls';
export const INCOMING_CALL_CATEGORY_ID = 'INCOMING_CALL';
export const ACTION_ACCEPT_CALL = 'ACCEPT_CALL';
export const ACTION_DECLINE_CALL = 'DECLINE_CALL';

let isConfigured = false;
let activeCallNotificationId: string | null = null;

function isRunningInExpoGo(): boolean {
  return (
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === 'storeClient'
  );
}

/**
 * Configures notification display behavior, Android high-priority call channel,
 * and Accept/Decline interactive notification buttons.
 */
export async function configureCallNotifications() {
  if (Platform.OS === 'web' || isConfigured) return;
  isConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as any;
      const isCallPush = data?.type === 'incoming_call';
      // Suppress system banner if user is already looking at the foreground app (In-app IncomingCallModal handles it)
      if (isCallPush && AppState.currentState === 'active') {
        return {
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: false,
          shouldShowList: false,
        };
      }

      return {
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(INCOMING_CALL_CHANNEL_ID, {
      name: 'Incoming Calls',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 1000, 800, 1000],
      lightColor: '#10b981',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      sound: 'default',
    }).catch(() => {});
  }

  await Notifications.setNotificationCategoryAsync(INCOMING_CALL_CATEGORY_ID, [
    {
      identifier: ACTION_DECLINE_CALL,
      buttonTitle: 'Decline',
      options: { isDestructive: true, opensAppToForeground: false },
    },
    {
      identifier: ACTION_ACCEPT_CALL,
      buttonTitle: 'Accept',
      options: { opensAppToForeground: true },
    },
  ]).catch(() => {});
}

/**
 * Registers for an Expo Push Token on physical standalone builds and syncs it to the backend
 * so incoming calls can wake the device even when the app is closed or swiped away.
 */
export async function registerAndSyncPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    await configureCallNotifications();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    // Expo SDK 53+ removed remote Android push token support inside Expo Go container;
    // standalone/dev builds generate valid FCM-backed Expo Push Tokens.
    if (!Device.isDevice || (isRunningInExpoGo() && Platform.OS === 'android')) {
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;

    if (!projectId) return null;

    const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenRes.data;

    if (expoPushToken) {
      await axiosInstance.put('/auth/push-token', { expoPushToken });
      return expoPushToken;
    }
  } catch (err) {
    console.warn('[Notifications] Push registration skipped:', err);
  }

  return null;
}

export async function clearSyncedPushToken() {
  if (Platform.OS === 'web') return;
  try {
    await axiosInstance.put('/auth/push-token', { expoPushToken: '' });
  } catch {
    // Ignore on logout failure
  }
}

/**
 * Displays a local high-priority call notification when Socket.IO receives an incoming call
 * while the app is minimized or screen-locked.
 */
export async function presentIncomingCallLocalNotification(data: {
  roomName: string;
  from: string;
  name?: string;
  avatar?: string;
  callType?: 'voice' | 'video';
  token?: string | null;
  url?: string | null;
}) {
  if (Platform.OS === 'web') return;

  try {
    await configureCallNotifications();
    await dismissIncomingCallNotifications();

    const isVoice = data.callType === 'voice';
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: data.name || 'Incoming Call',
        body: isVoice ? 'Incoming Chatter voice call' : 'Incoming Chatter video call',
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        categoryIdentifier: INCOMING_CALL_CATEGORY_ID,
        sticky: true,
        data: {
          type: 'incoming_call',
          roomName: data.roomName,
          from: data.from,
          name: data.name || 'Incoming Caller',
          avatar: data.avatar || '',
          callType: data.callType || 'video',
          token: data.token || '',
          url: data.url || '',
        },
      },
      trigger: null,
    });

    activeCallNotificationId = id;
  } catch {
    // Ignore if notifications disabled
  }
}

export async function dismissIncomingCallNotifications() {
  if (Platform.OS === 'web') return;
  try {
    if (activeCallNotificationId) {
      await Notifications.dismissNotificationAsync(activeCallNotificationId);
      activeCallNotificationId = null;
    }
    await Notifications.dismissAllNotificationsAsync();
  } catch {
    // Ignore
  }
}

const handledResponseIds = new Set<string>();

/**
 * Attaches listeners for incoming call notification taps / Accept / Decline actions,
 * including cold-start launches when the app was closed.
 */
export function setupCallNotificationListeners(handlers: {
  onIncomingCallAction: (data: any, autoAccept: boolean) => void;
  onDeclineCallAction: (callerId: string) => void;
}) {
  if (Platform.OS === 'web') return () => {};

  configureCallNotifications().catch(() => {});

  const processResponse = (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    const notifId = response.notification.request.identifier;
    if (handledResponseIds.has(notifId)) return;

    const data = response.notification.request.content.data as any;
    if (!data || data.type !== 'incoming_call') return;

    handledResponseIds.add(notifId);
    dismissIncomingCallNotifications();

    const actionId = response.actionIdentifier;
    if (actionId === ACTION_DECLINE_CALL) {
      if (data.from) handlers.onDeclineCallAction(data.from);
    } else if (actionId === ACTION_ACCEPT_CALL) {
      handlers.onIncomingCallAction(data, true);
    } else {
      handlers.onIncomingCallAction(data, false);
    }
  };

  // Cold-start launch from killed state
  try {
    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) {
      processResponse(lastResponse);
      Notifications.clearLastNotificationResponse();
    }
  } catch {
    // Ignore
  }

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    processResponse(response);
  });

  return () => {
    responseSub.remove();
  };
}
