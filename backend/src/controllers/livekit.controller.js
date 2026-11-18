import { AccessToken } from "livekit-server-sdk";

export const getLiveKitToken = async (req, res) => {
  try {
    const { roomName } = req.query;

    if (!roomName || typeof roomName !== "string") {
      return res.status(400).json({ message: "roomName is required" });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      return res.status(500).json({ message: "LiveKit credentials are not configured on the server" });
    }

    const user = req.user;
    const identity = user._id.toString();
    const participantName = user.fullName || "User";

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: participantName,
      ttl: "2h",
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return res.status(200).json({
      token,
      url: livekitUrl,
      roomName,
    });
  } catch (error) {
    console.error("Error generating LiveKit token:", error);
    return res.status(500).json({ message: "Failed to generate LiveKit token" });
  }
};
