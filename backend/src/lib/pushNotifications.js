import axios from "axios";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function isValidExpoToken(token) {
  return (
    typeof token === "string" &&
    (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["))
  );
}

export async function sendIncomingCallPush({
  expoPushToken,
  roomName,
  callerId,
  callerName,
  callerAvatar,
  callType,
  receiverToken,
  livekitUrl,
}) {
  if (!isValidExpoToken(expoPushToken)) return false;

  const isVoice = callType === "voice";
  const payload = {
    to: expoPushToken,
    sound: "default",
    priority: "high",
    ttl: 45,
    channelId: "incoming_calls",
    categoryId: "INCOMING_CALL",
    title: callerName || "Incoming Call",
    body: isVoice ? "Incoming Chatter voice call" : "Incoming Chatter video call",
    data: {
      type: "incoming_call",
      roomName,
      from: callerId,
      name: callerName || "Incoming Caller",
      avatar: callerAvatar || "",
      callType: callType || "video",
      token: receiverToken || "",
      url: livekitUrl || "",
      sentAt: Date.now(),
    },
  };

  try {
    await axios.post(EXPO_PUSH_URL, payload, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      timeout: 5000,
    });
    return true;
  } catch (error) {
    console.warn("Failed to dispatch incoming call push notification:", error.message);
    return false;
  }
}

export async function sendMissedCallPush({
  expoPushToken,
  callerId,
  callerName,
  callType,
  roomName,
}) {
  if (!isValidExpoToken(expoPushToken)) return false;

  const payload = {
    to: expoPushToken,
    sound: "default",
    priority: "normal",
    channelId: "incoming_calls",
    title: callerName || "Missed Call",
    body: callType === "voice" ? "Missed voice call" : "Missed video call",
    data: {
      type: "missed_call",
      roomName,
      from: callerId,
      callType: callType || "video",
    },
  };

  try {
    await axios.post(EXPO_PUSH_URL, payload, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}
