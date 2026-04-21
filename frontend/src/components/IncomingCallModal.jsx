import { PhoneCall, PhoneForwarded, PhoneOff } from "lucide-react";
import { useCallStore } from "../store/useCallStore";
import { useNavigate } from "react-router-dom";

const IncomingCallModal = () => {
  const { receivingCall, callerName, answerCall, rejectCall, callAccepted } = useCallStore();
  const navigate = useNavigate();

  if (!receivingCall || callAccepted) return null;

  const handleAccept = () => {
    answerCall();
    // we want to ensure we route to a chat or open the video call modal somehow.
    // In our App, the VideoCall component is currently in ChatHeader, but if we receive a call globally,
    // we might not be in that specific chat. 
    // For now we assume VideoCall component handles rendering if callActive is true.
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-base-100 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-6 animate-in zoom-in-95 duration-300">
        <div className="relative">
          <div className="size-20 bg-primary/20 rounded-full flex items-center justify-center animate-pulse">
            <PhoneCall className="size-10 text-primary" />
          </div>
        </div>
        
        <div className="text-center">
          <h3 className="text-2xl font-bold mb-2">Incoming Call...</h3>
          <p className="text-base-content/70 text-lg">{callerName} is calling you</p>
        </div>

        <div className="flex gap-6 mt-4">
          <button 
            onClick={rejectCall}
            className="btn btn-circle btn-error btn-lg shadow-lg hover:scale-105 transition-transform"
          >
            <PhoneOff className="size-8 text-white" />
          </button>
          
          <button 
            onClick={handleAccept}
            className="btn btn-circle btn-success btn-lg shadow-lg hover:scale-105 transition-transform animate-bounce"
          >
            <PhoneForwarded className="size-8 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;
