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
import { useEffect, useRef, useState } from "react";
import { useCallStore } from "../store/useCallStore";
import { usePrivacyStore } from "../store/usePrivacyStore";

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

  const [isSwapped, setIsSwapped] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const protectScreenshots = usePrivacyStore((s) => s.protectScreenshots);

  useEffect(() => {
    if (!protectScreenshots) return undefined;
    document.body.classList.add("privacy-block-print");
    return () => {
      document.body.classList.remove("privacy-block-print");
    };
  }, [protectScreenshots]);

  const mainVideoRef = useRef(null);
  const pipVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const participantName = targetUser?.fullName || callerName || "Unknown User";
  const participantAvatar = targetUser?.profilePic || callerAvatar || "/avatar.png";
  const isVoice = callType === "voice";
  const isConnected = callStatus === "connected";
  const showRemoteVideo = Boolean(remoteVideoTrack && !remoteVideoMuted);
  const showLocalVideo = Boolean(localVideoTrack && !isCameraOff);

  const mainIsLocal = isSwapped && !isVoice;
  const mainTrack = mainIsLocal
    ? showLocalVideo
      ? localVideoTrack
      : null
    : showRemoteVideo
    ? remoteVideoTrack
    : null;
  const pipTrack = mainIsLocal
    ? showRemoteVideo
      ? remoteVideoTrack
      : null
    : showLocalVideo
    ? localVideoTrack
    : null;

  // Attach main screen video track (supports tapping PiP to swap)
  useEffect(() => {
    const el = mainVideoRef.current;
    if (!el || !mainTrack) return;
    mainTrack.attach(el);
    return () => {
      mainTrack.detach(el);
    };
  }, [mainTrack, isSwapped, callType]);

  // Attach PiP video track
  useEffect(() => {
    const el = pipVideoRef.current;
    if (!el || !pipTrack) return;
    pipTrack.attach(el);
    return () => {
      pipTrack.detach(el);
    };
  }, [pipTrack, isSwapped, callType]);

  // Attach remote audio track and respect local speaker mute
  useEffect(() => {
    const el = remoteAudioRef.current;
    if (!el || !remoteAudioTrack) return;
    el.muted = isSpeakerMuted;
    remoteAudioTrack.attach(el);
    return () => {
      remoteAudioTrack.detach(el);
    };
  }, [remoteAudioTrack, isSpeakerMuted]);

  const handleSpeakerPress = () => {
    if (audioBlocked) {
      unlockAudio();
      setIsSpeakerMuted(false);
      return;
    }
    setIsSpeakerMuted((prev) => !prev);
  };

  const statusText = isConnected
    ? formatDuration(callDuration)
    : callStatus === "ringing"
    ? "Ringing..."
    : "Connecting...";

  return (
    <div
      className={`fixed inset-0 z-50 bg-zinc-950 text-white overflow-hidden select-none animate-in fade-in duration-200 ${
        protectScreenshots ? "privacy-protected-media" : ""
      }`}
      onContextMenu={(e) => protectScreenshots && e.preventDefault()}
    >
      <audio ref={remoteAudioRef} autoPlay playsInline muted={isSpeakerMuted} />

      {/* Background Layer */}
      {!isVoice && mainTrack ? (
        <video
          ref={mainVideoRef}
          autoPlay
          playsInline
          muted={mainIsLocal}
          disablePictureInPicture={protectScreenshots}
          controlsList="nodownload"
          className={`absolute inset-0 w-full h-full object-cover ${
            mainIsLocal && facingMode === "user" ? "-scale-x-100" : "scale-x-100"
          }`}
        />
      ) : (
        <>
          <img
            src={participantAvatar}
            alt={participantName}
            draggable={!protectScreenshots}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />
        </>
      )}

      {/* Top Centered Overlay + Top-Right Flip Camera (in Video Mode) */}
      <div className="relative z-30 flex items-start justify-between px-5 sm:px-8 pt-10 sm:pt-12">
        <div className="w-10" />

        <div className="flex flex-col items-center text-center min-w-0">
          <span className="text-xs sm:text-sm font-medium text-white/80 tracking-wide">
            {isVoice ? "Chatter Audio" : "Chatter Video"} • {statusText}
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1 truncate max-w-[70vw] drop-shadow-md">
            {participantName}
          </h2>
          {isConnected && remoteAudioMuted && (
            <span className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/60 text-red-300 text-xs font-medium">
              <MicOff className="size-3" />
              Muted
            </span>
          )}
        </div>

        <div className="w-10 flex justify-end">
          {!isVoice && showLocalVideo && (
            <button
              type="button"
              onClick={switchCamera}
              className="size-10 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center backdrop-blur-md transition-colors"
              title="Flip camera"
              aria-label="Flip camera"
            >
              <SwitchCamera className="size-5" />
            </button>
          )}
        </div>
      </div>

      {/* Browser Autoplay Fallback Banner */}
      {audioBlocked && (
        <div className="relative z-40 mt-4 flex justify-center px-4">
          <button
            type="button"
            onClick={handleSpeakerPress}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold text-sm shadow-xl active:scale-95 transition-transform"
          >
            <VolumeX className="size-4" />
            Tap to enable call audio
          </button>
        </div>
      )}

      {/* Tappable Picture-in-Picture Self/Remote Video Tile (Touch to Swap) */}
      {!isVoice && (
        <button
          type="button"
          onClick={() => setIsSwapped((prev) => !prev)}
          className="absolute bottom-28 right-5 sm:bottom-32 sm:right-8 z-30 w-28 h-40 sm:w-36 sm:h-52 rounded-2xl overflow-hidden bg-zinc-900 border-2 border-white/25 shadow-2xl cursor-pointer active:scale-95 transition-transform"
          title="Tap to swap video view"
          aria-label="Swap video view"
        >
          {pipTrack ? (
            <video
              ref={pipVideoRef}
              autoPlay
              playsInline
              muted={!mainIsLocal}
              disablePictureInPicture={protectScreenshots}
              controlsList="nodownload"
              className={`w-full h-full object-cover ${
                !mainIsLocal && facingMode === "user" ? "-scale-x-100" : "scale-x-100"
              }`}
            />
          ) : (
            <div className="w-full h-full relative flex items-center justify-center bg-zinc-900">
              {mainIsLocal ? (
                <img
                  src={participantAvatar}
                  alt={participantName}
                  draggable={!protectScreenshots}
                  className="w-full h-full object-cover opacity-60"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-white/75">
                  <VideoOff className="size-5 text-red-400" />
                  <span className="text-[11px]">Camera off</span>
                </div>
              )}
            </div>
          )}
        </button>
      )}

      {/* Bottom Controls */}
      <div className="absolute bottom-8 sm:bottom-10 inset-x-0 z-30 flex justify-center px-4">
        {isVoice ? (
          /* Voice Mode: Darkened rounded control box only */
          <div className="bg-black/70 backdrop-blur-xl rounded-[32px] px-7 py-6 shadow-2xl flex flex-col items-center gap-6">
            <div className="flex items-center justify-center gap-7 sm:gap-9">
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSpeakerPress}
                  className={`size-14 rounded-full flex items-center justify-center transition-colors ${
                    !isSpeakerMuted && !audioBlocked
                      ? "bg-white text-zinc-950"
                      : "bg-white/20 text-white hover:bg-white/30"
                  }`}
                  aria-label="Toggle speaker"
                >
                  {isSpeakerMuted || audioBlocked ? (
                    <VolumeX className="size-6" />
                  ) : (
                    <Volume2 className="size-6" />
                  )}
                </button>
                <span className="text-xs text-white/85">Speaker</span>
              </div>

              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleCamera}
                  className="size-14 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
                  aria-label="Switch to video"
                >
                  <Video className="size-6" />
                </button>
                <span className="text-xs text-white/85">Video</span>
              </div>

              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`size-14 rounded-full flex items-center justify-center transition-colors ${
                    isMicMuted
                      ? "bg-white text-zinc-950"
                      : "bg-white/20 text-white hover:bg-white/30"
                  }`}
                  aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
                >
                  {isMicMuted ? (
                    <MicOff className="size-6" />
                  ) : (
                    <Mic className="size-6" />
                  )}
                </button>
                <span className="text-xs text-white/85">
                  {isMicMuted ? "Unmute" : "Mute"}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => leaveCall(true)}
              className="size-16 rounded-full bg-[#ef1c43] hover:brightness-110 active:scale-95 text-white flex items-center justify-center shadow-lg transition-transform"
              aria-label="End call"
            >
              <PhoneOff className="size-7" />
            </button>
          </div>
        ) : (
          /* Video Mode: Spacious Horizontal Pill Bar (Camera, Speaker, Mic, End) */
          <div className="bg-[#161618] rounded-full px-3.5 py-2.5 flex items-center gap-5 sm:gap-6 shadow-2xl border border-white/10">
            <button
              type="button"
              onClick={toggleCamera}
              className={`size-12 sm:size-14 rounded-full flex items-center justify-center transition-colors ${
                isCameraOff
                  ? "bg-white text-zinc-950"
                  : "bg-[#3c3c3e] text-white hover:bg-[#4e4e52]"
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

            <button
              type="button"
              onClick={handleSpeakerPress}
              className={`size-12 sm:size-14 rounded-full flex items-center justify-center transition-colors ${
                !isSpeakerMuted && !audioBlocked
                  ? "bg-white text-zinc-950"
                  : "bg-[#3c3c3e] text-white hover:bg-[#4e4e52]"
              }`}
              title="Toggle speaker"
              aria-label="Toggle speaker"
            >
              {isSpeakerMuted || audioBlocked ? (
                <VolumeX className="size-5 sm:size-6" />
              ) : (
                <Volume2 className="size-5 sm:size-6" />
              )}
            </button>

            <button
              type="button"
              onClick={toggleMic}
              className={`size-12 sm:size-14 rounded-full flex items-center justify-center transition-colors ${
                isMicMuted
                  ? "bg-white text-zinc-950"
                  : "bg-[#3c3c3e] text-white hover:bg-[#4e4e52]"
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

            <button
              type="button"
              onClick={() => leaveCall(true)}
              className="size-12 sm:size-14 rounded-full bg-[#ef1c43] hover:brightness-110 active:scale-95 text-white flex items-center justify-center transition-transform"
              title="End call"
              aria-label="End call"
            >
              <PhoneOff className="size-5 sm:size-6" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default VideoCall;
