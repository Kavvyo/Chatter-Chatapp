import { useEffect } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { useCallStore } from "../store/useCallStore";
import { usePrivacyStore } from "../store/usePrivacyStore";

const IncomingCallModal = () => {
  const {
    receivingCall,
    callerName,
    callerAvatar,
    callType,
    answerCall,
    rejectCall,
    callAccepted,
  } = useCallStore();
  const protectScreenshots = usePrivacyStore((s) => s.protectScreenshots);

  useEffect(() => {
    if (!receivingCall || callAccepted || !protectScreenshots) return undefined;
    document.body.classList.add("privacy-block-print");
    return () => {
      document.body.classList.remove("privacy-block-print");
    };
  }, [receivingCall, callAccepted, protectScreenshots]);

  if (!receivingCall || callAccepted) return null;

  const isVoice = callType === "voice";

  return (
    <div
      className={`fixed inset-0 z-[100] bg-zinc-950 text-white flex flex-col justify-between overflow-hidden select-none animate-in fade-in duration-200 ${
        protectScreenshots ? "privacy-protected-media" : ""
      }`}
      onContextMenu={(e) => protectScreenshots && e.preventDefault()}
    >
      {/* Full-screen Darkened Caller Portrait */}
      <img
        src={callerAvatar || "/avatar.png"}
        alt={callerName}
        draggable={!protectScreenshots}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />

      {/* Centered Top Call Header */}
      <div className="relative z-10 flex flex-col items-center text-center pt-16 sm:pt-20 px-6">
        <span className="text-sm sm:text-base font-medium text-white/80 tracking-wide">
          {isVoice ? "Chatter Audio..." : "Chatter Video..."}
        </span>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-2 drop-shadow-md">
          {callerName}
        </h2>
      </div>

      {/* Bottom Action Buttons (Zero extra box / no message button) */}
      <div className="relative z-10 flex items-center justify-center gap-16 sm:gap-24 pb-16 sm:pb-20 px-6">
        <div className="flex flex-col items-center gap-2.5">
          <button
            type="button"
            onClick={rejectCall}
            className="size-16 sm:size-[72px] rounded-full bg-[#ff3b30] hover:brightness-110 active:scale-95 text-white flex items-center justify-center shadow-2xl transition-transform"
            aria-label="Decline call"
          >
            <PhoneOff className="size-7 sm:size-8" />
          </button>
          <span className="text-sm font-medium text-white/90">Decline</span>
        </div>

        <div className="flex flex-col items-center gap-2.5">
          <button
            type="button"
            onClick={answerCall}
            className="size-16 sm:size-[72px] rounded-full bg-[#34c759] hover:brightness-110 active:scale-95 text-white flex items-center justify-center shadow-2xl transition-transform animate-pulse"
            aria-label="Accept call"
          >
            {isVoice ? (
              <Phone className="size-7 sm:size-8" />
            ) : (
              <Video className="size-7 sm:size-8" />
            )}
          </button>
          <span className="text-sm font-medium text-white/90">Accept</span>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;
