import { PhoneOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { useCallStore } from "../store/useCallStore";

function VideoCall() {
  const { localStream, remoteStream, leaveCall } = useCallStore();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(e => console.warn("Local play failed", e));
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(e => console.warn("Remote play failed", e));
    }
  }, [remoteStream]);

  const handleEndCall = () => {
    leaveCall();
  };

  return (
    <div className="w-[80vw] max-w-4xl max-h-[90vh]">
      <div className="relative flex justify-center items-center rounded-2xl overflow-hidden bg-black shadow-2xl">
        
        {/* Remote Video (Main) */}
        <div className="w-full aspect-video bg-zinc-900 flex items-center justify-center">
          {remoteStream ? (
            <video
              playsInline
              ref={remoteVideoRef}
              autoPlay
              className="w-full h-full object-cover transform scaleX(-1)"
            />
          ) : (
            <div className="text-white animate-pulse">Connecting...</div>
          )}
        </div>

        {/* Local Video (PiP) */}
        <div className="absolute right-5 bottom-5 w-1/4 max-w-[200px] aspect-video bg-zinc-800 rounded-xl overflow-hidden border-2 border-primary/50 shadow-lg z-10 transition-transform hover:scale-105">
          {localStream ? (
            <video
              playsInline
              muted
              ref={localVideoRef}
              autoPlay
              className="w-full h-full object-cover transform scaleX(-1)"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/50 text-xs">
              Muted
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="absolute border border-white/10 bg-black/40 backdrop-blur-md bottom-8 p-3 flex items-center rounded-full shadow-2xl z-20">
          <button
            onClick={handleEndCall}
            className="bg-red-500 hover:bg-red-600 rounded-full size-12 flex items-center justify-center transition-colors shadow-[0_0_15px_rgba(239,68,68,0.5)]"
          >
            <PhoneOff className="text-white size-6" />
          </button>
        </div>

      </div>
    </div>
  );
}

export default VideoCall;