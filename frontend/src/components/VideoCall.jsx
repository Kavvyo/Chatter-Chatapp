import {
  Mic,
  MicOff,
  PhoneOff,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
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
    localStream,
    remoteStream,
    targetUser,
    callerName,
    callerAvatar,
    callType,
    callStatus,
    callDuration,
    isMicMuted,
    isCameraOff,
    toggleMic,
    toggleCamera,
    switchCamera,
    leaveCall,
  } = useCallStore();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const participantName = targetUser?.fullName || callerName || "Unknown User";
  const participantAvatar = targetUser?.profilePic || callerAvatar || "/avatar.png";
  const isVoice = callType === "voice";
  const isConnected = callStatus === "connected" && remoteStream;

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch((e) => console.warn("Local play error:", e));
    }
  }, [localStream, isCameraOff]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch((e) => console.warn("Remote video play error:", e));
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch((e) => console.warn("Remote audio play error:", e));
    }
  }, [remoteStream]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-300">
      
      {/* Hidden audio element to guarantee remote voice playback */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className="relative w-full h-full sm:h-[90vh] sm:max-h-[850px] sm:max-w-4xl sm:rounded-3xl overflow-hidden bg-zinc-950 text-white flex flex-col justify-between shadow-2xl border border-white/10">
        
        {/* Top Header Overlay */}
        <div className="absolute top-0 inset-x-0 z-30 p-4 sm:p-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 sm:size-12 rounded-full overflow-hidden border border-white/20 bg-zinc-800 shadow-md">
              <img
                src={participantAvatar}
                alt={participantName}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h2 className="font-semibold text-base sm:text-lg tracking-tight line-clamp-1">
                {participantName}
              </h2>
              <div className="flex items-center gap-2 text-xs sm:text-sm text-zinc-300">
                <span className="inline-flex items-center gap-1">
                  <span
                    className={`size-2 rounded-full ${
                      isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-400"
                    }`}
                  />
                  {isConnected ? formatDuration(callDuration) : callStatus === "ringing" ? "Ringing..." : "Connecting..."}
                </span>
                <span>•</span>
                <span className="capitalize">{callType} call</span>
              </div>
            </div>
          </div>

          <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-medium tracking-wide">
            {isConnected ? "Secure E2E" : "Setting up..."}
          </div>
        </div>

        {/* Center Main View Area */}
        <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden">
          
          {/* VOICE CALL MODE */}
          {isVoice ? (
            <div className="flex flex-col items-center justify-center gap-6 p-6 text-center select-none">
              
              {/* Pulsing Avatar Area */}
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

              {/* Status and Participant Details */}
              <div className="space-y-2 z-10">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {participantName}
                </h1>
                <p className="text-zinc-400 text-sm sm:text-base font-medium flex items-center justify-center gap-2">
                  {isConnected ? (
                    <>
                      <Volume2 className="size-4 text-emerald-400 animate-bounce" />
                      <span>In Voice Call</span>
                    </>
                  ) : (
                    <span>{callStatus === "ringing" ? "Ringing..." : "Connecting..."}</span>
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
              {remoteStream ? (
                <video
                  playsInline
                  ref={remoteVideoRef}
                  autoPlay
                  className="w-full h-full object-cover"
                />
              ) : (
                /* Connecting / Ringing Placeholder */
                <div className="flex flex-col items-center justify-center gap-4 text-center p-6">
                  <div className="relative flex items-center justify-center">
                    <span className="absolute size-32 rounded-full bg-primary/20 animate-ping" />
                    <div className="size-24 rounded-full overflow-hidden border-2 border-primary/50 shadow-xl bg-zinc-800">
                      <img
                        src={participantAvatar}
                        alt={participantName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-semibold">{participantName}</h3>
                    <p className="text-sm text-zinc-400 animate-pulse">
                      {callStatus === "ringing" ? "Ringing..." : "Waiting for video stream..."}
                    </p>
                  </div>
                </div>
              )}

              {/* Local Video (PiP self-preview) */}
              <div className="absolute top-20 right-4 sm:top-24 sm:right-6 w-28 h-40 sm:w-44 sm:h-32 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 z-20 bg-zinc-900 transition-all">
                {localStream && !isCameraOff ? (
                  <video
                    playsInline
                    muted
                    ref={localVideoRef}
                    autoPlay
                    className="w-full h-full object-cover transform scale-x-[-1]"
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

            {/* Switch Camera (if camera is active and video call) */}
            {!isCameraOff && localStream && localStream.getVideoTracks().length > 0 && (
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
              className="size-13 sm:size-15 rounded-full bg-red-600 hover:bg-red-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-red-600/40 transition-all p-3 sm:p-4"
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
