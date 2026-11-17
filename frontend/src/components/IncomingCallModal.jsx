import { Phone, PhoneOff, Video } from "lucide-react";
import { useCallStore } from "../store/useCallStore";

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

  if (!receivingCall || callAccepted) return null;

  const isVoice = callType === "voice";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-base-100 border border-base-300 w-full max-w-sm sm:max-w-md p-6 sm:p-8 rounded-3xl shadow-2xl flex flex-col items-center text-center gap-6 animate-in zoom-in-95 duration-300">
        
        {/* Caller Avatar with animated waves */}
        <div className="relative flex items-center justify-center my-2">
          <span className="absolute size-28 sm:size-32 rounded-full bg-primary/20 animate-ping opacity-75" />
          <span className="absolute size-24 sm:size-28 rounded-full bg-primary/30 animate-pulse" />
          
          <div className="relative size-20 sm:size-24 rounded-full overflow-hidden border-2 border-primary shadow-xl z-10 bg-base-300">
            <img
              src={callerAvatar || "/avatar.png"}
              alt={callerName}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="absolute -bottom-1 -right-1 z-20 bg-primary text-primary-content p-1.5 rounded-full shadow-md">
            {isVoice ? (
              <Phone className="size-4" />
            ) : (
              <Video className="size-4" />
            )}
          </div>
        </div>

        {/* Text Details */}
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary uppercase tracking-wider">
            {isVoice ? "Voice Call" : "Video Call"}
          </span>
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-base-content mt-1">
            {callerName}
          </h3>
          <p className="text-sm text-base-content/70">Incoming call...</p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-8 sm:gap-10 mt-2 w-full">
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={rejectCall}
              className="btn btn-circle btn-error size-14 sm:size-16 shadow-lg shadow-error/30 hover:scale-105 active:scale-95 transition-all text-white"
              aria-label="Decline call"
            >
              <PhoneOff className="size-6 sm:size-7" />
            </button>
            <span className="text-xs text-base-content/70 font-medium">Decline</span>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={answerCall}
              className="btn btn-circle btn-success size-14 sm:size-16 shadow-lg shadow-success/40 hover:scale-105 active:scale-95 transition-all text-white animate-bounce"
              aria-label="Accept call"
            >
              {isVoice ? (
                <Phone className="size-6 sm:size-7" />
              ) : (
                <Video className="size-6 sm:size-7" />
              )}
            </button>
            <span className="text-xs text-base-content/70 font-medium">Accept</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default IncomingCallModal;
