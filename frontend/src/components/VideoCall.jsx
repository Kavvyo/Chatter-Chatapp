import {
  Mic,
  MicOff,
  PhoneOff,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { useCallStore } from "../store/useCallStore";

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function VideoCall() {
  const {
    localVideoTrack,
    remoteVideoTrack,
    remoteAudioTrack,
    remoteVideoMuted,
    remoteAudioMuted,
    audioBlocked,
    targetUser,
    callerName,
    callerAvatar,
    callType,
    callStatus,
    callDuration,
    isMicMuted,
    isCameraOff,
    facingMode,
    toggleMic,
    toggleCamera,
    switchCamera,
    unlockAudio,
    leaveCall,
  } = useCallStore();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const participantName = targetUser?.fullName || callerName || "Unknown User";
  const participantAvatar = targetUser?.profilePic || callerAvatar || "/avatar.png";
  const isVoice = callType === "voice";
  const isConnected = callStatus === "connected";
  const showRemoteVideo = Boolean(remoteVideoTrack && !remoteVideoMuted);

  // Attach / detach local camera track
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el || !localVideoTrack || isCameraOff) return;

    localVideoTrack.attach(el);
    return () => {
      localVideoTrack.detach(el);
    };
  }, [localVideoTrack, isCameraOff, callType]);

  // Attach / detach remote video track
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el || !remoteVideoTrack || remoteVideoMuted) return;

    remoteVideoTrack.attach(el);
    return () => {
      remoteVideoTrack.detach(el);
    };
  }, [remoteVideoTrack, remoteVideoMuted, callType]);

  // Attach / detach remote audio track
  useEffect(() => {
    const el = remoteAudioRef.current;
    if (!el || !remoteAudioTrack) return;

    remoteAudioTrack.attach(el);
    return () => {
      remoteAudioTrack.detach(el);
    };
  }, [remoteAudioTrack]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-300">
      {/* Dedicated audio element for LiveKit remote audio track */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className="relative w-full h-full sm:h-[90vh] sm:max-h-[850px] sm:max-w-4xl sm:rounded-3xl overflow-hidden bg-zinc-950 text-white flex flex-col justify-between shadow-2xl border border-white/10">
        {/* Top Header Overlay */}
        <div className="absolute top-0 inset-x-0 z-30 p-4 sm:p-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-10 sm:size-12 rounded-full overflow-hidden border border-white/20 bg-zinc-800 shadow-md shrink-0">
              <img
                src={participantAvatar}
                alt={participantName}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-base sm:text-lg tracking-tight truncate">
                  {participantName}
                </h2>
                {isConnected && remoteAudioMuted && (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 text-[10px] font-medium shrink-0"
                    title="Participant is muted"
                  >
                    <MicOff className="size-3" />
                    Muted
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs sm:text-sm text-zinc-300">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`size-2 rounded-full ${
                      isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-400"
                    }`}
                  />
                  {isConnected
                    ? formatDuration(callDuration)
                    : callStatus === "ringing"
                    ? "Ringing..."
                    : "Connecting..."}
                </span>
                <span>•</span>
                <span className="capitalize">{callType} call</span>
              </div>
            </div>
          </div>

          <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-medium tracking-wide shrink-0">
            {isConnected ? "HD Live" : "Connecting"}
          </div>
        </div>

        {/* Mobile Audio Autoplay Fallback Banner */}
        {audioBlocked && (
          <div className="absolute top-20 inset-x-0 z-40 flex justify-center px-4">
            <button
              onClick={unlockAudio}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold text-sm shadow-xl transition-transform active:scale-95"
            >
              <VolumeX className="size-4" />
              Tap to enable call audio
            </button>
          </div>
        )}

        {/* Center Main View Area */}
        <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden">
          {/* VOICE CALL MODE */}
          {isVoice ? (
            <div className="flex flex-col items-center justify-center gap-6 p-6 text-center select-none">
              <div className="relative flex items-center justify-center">
                {isConnected && (
                  <>
                    <span className="absolute size-48 sm:size-60 rounded-full bg-emerald-500/10 animate-ping opacity-60" />
                    <span className="absolute size-40 sm:size-52 rounded-full bg-emerald-500/15 animate-pulse" />
                  </>
                )}
                <div className="relative size-32 sm:size-40 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl bg-zinc-800 z-10">
                  <img
                    src={participantAvatar}
                    alt={participantName}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              <div className="space-y-2 z-10">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {participantName}
                </h1>
                <p className="text-zinc-400 text-sm sm:text-base font-medium flex items-center justify-center gap-2">
                  {isConnected ? (
                    <>
                      <Volume2 className="size-4 text-emerald-400 animate-bounce" />
                      <span>{remoteAudioMuted ? "Participant muted" : "In Voice Call"}</span>
                    </>
                  ) : (
                    <span>
                      {callStatus === "ringing" ? "Ringing..." : "Connecting..."}
                    </span>
                  )}
                </p>
                {isConnected && (
                  <p className="text-xl font-mono text-emerald-400 font-semibold">
                    {formatDuration(callDuration)}
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* VIDEO CALL MODE */
            <div className="relative w-full h-full bg-zinc-900 flex items-center justify-center">
              {/* Remote Video (Main background view) */}
              {showRemoteVideo ? (
                <video
                  playsInline
                  ref={remoteVideoRef}
                  autoPlay
                  className="w-full h-full object-cover"
                />
              ) : (
                /* Connecting / Ringing / Remote Camera Off Placeholder */
                <div className="flex flex-col items-center justify-center gap-4 text-center p-6">
                  <div className="relative flex items-center justify-center">
                    {!isConnected && (
                      <span className="absolute size-32 rounded-full bg-primary/20 animate-ping" />
                    )}
                    <div className="size-24 sm:size-28 rounded-full overflow-hidden border-2 border-white/20 shadow-xl bg-zinc-800 relative z-10">
                      <img
                        src={participantAvatar}
                        alt={participantName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-semibold">{participantName}</h3>
                    <p className="text-sm text-zinc-400">
                      {isConnected
                        ? "Camera is off"
                        : callStatus === "ringing"
                        ? "Ringing..."
                        : "Connecting..."}
                    </p>
                  </div>
                </div>
              )}

              {/* Local Video (PiP self-preview) */}
              <div className="absolute top-20 right-4 sm:top-24 sm:right-6 w-28 h-40 sm:w-44 sm:h-32 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 z-20 bg-zinc-900 transition-all">
                {localVideoTrack && !isCameraOff ? (
                  <video
                    playsInline
                    muted
                    ref={localVideoRef}
                    autoPlay
                    className={`w-full h-full object-cover ${
                      facingMode === "user" ? "transform scale-x-[-1]" : ""
                    }`}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800/90 text-zinc-400 gap-1 p-2">
                    <VideoOff className="size-5 text-red-400" />
                    <span className="text-[10px] font-medium">Camera off</span>
                  </div>
                )}

                {/* Self Mute Badge on PiP */}
                {isMicMuted && (
                  <div className="absolute bottom-2 left-2 bg-red-600/90 text-white p-1 rounded-md shadow-sm">
                    <MicOff className="size-3" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Floating Control Dock */}
        <div className="absolute bottom-6 sm:bottom-8 inset-x-0 z-30 flex items-center justify-center px-4">
          <div className="flex items-center gap-3 sm:gap-6 px-5 py-3 sm:px-8 sm:py-4 rounded-full bg-zinc-900/80 backdrop-blur-xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            {/* Mute / Unmute Microphone */}
            <button
              onClick={toggleMic}
              className={`size-12 sm:size-14 rounded-full flex items-center justify-center transition-all ${
                isMicMuted
                  ? "bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30"
                  : "bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95"
              }`}
              title={isMicMuted ? "Unmute microphone" : "Mute microphone"}
              aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
            >
              {isMicMuted ? (
                <MicOff className="size-5 sm:size-6" />
              ) : (
                <Mic className="size-5 sm:size-6" />
              )}
            </button>

            {/* Toggle Camera (On / Off or Upgrade Voice to Video) */}
            <button
              onClick={toggleCamera}
              className={`size-12 sm:size-14 rounded-full flex items-center justify-center transition-all ${
                isCameraOff
                  ? "bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30"
                  : "bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95"
              }`}
              title={isCameraOff ? "Turn on camera" : "Turn off camera"}
              aria-label={isCameraOff ? "Turn on camera" : "Turn off camera"}
            >
              {isCameraOff ? (
                <VideoOff className="size-5 sm:size-6" />
              ) : (
                <Video className="size-5 sm:size-6" />
              )}
            </button>

            {/* Switch Camera (when camera is active) */}
            {!isCameraOff && localVideoTrack && (
              <button
                onClick={switchCamera}
                className="size-12 sm:size-14 rounded-full bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95 flex items-center justify-center transition-all"
                title="Flip camera"
                aria-label="Flip camera"
              >
                <SwitchCamera className="size-5 sm:size-6 text-zinc-300" />
              </button>
            )}

            {/* End Call Button */}
            <button
              onClick={() => leaveCall(true)}
              className="size-14 sm:size-16 rounded-full bg-red-600 hover:bg-red-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-red-600/40 transition-all"
              title="End call"
              aria-label="End call"
            >
              <PhoneOff className="size-6 sm:size-7" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoCall;
