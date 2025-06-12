import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import ChatHeader from "../components/ChatHeader";
import MessageInput from "../components/MessageInput";
import MessageSkeleton from "./Skeletons/MessageSkeleton";
import { useAuthStore } from "../store/useAuthStore";
import { formatMessageTime } from "../lib/utils";
import ScrollToTheBottom from "./ScrollToTheBottom";
import { Check, CheckCheck } from "lucide-react";

function ChatContainer() {
  const {messages, getMessages, isMessagesLoading, selectedUser, subscribeToMessages, unSubscribeFromMessages} = useChatStore();
  const {authUser} = useAuthStore();
  const messageEndRef = useRef();
  const initialLoadDone = useRef(false);
  const {socket } = useAuthStore();
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    initialLoadDone.current = false;
    getMessages(selectedUser._id);
    subscribeToMessages();

    return () => unSubscribeFromMessages();
  }, [selectedUser._id, getMessages, subscribeToMessages, unSubscribeFromMessages]);

  useEffect(() => {
    if (!socket || !selectedUser?._id) return;

    const handleTyping = ({ from }) => {
      if (from === selectedUser._id) {
        setIsTyping(true);
      }
    };

    const handleStopTyping = ({ from }) => {
      if (from === selectedUser._id) {
        setIsTyping(false);
      }
    };

    socket.on("typing", handleTyping);
    socket.on("stopTyping", handleStopTyping);

    return () => {
      socket.off("typing", handleTyping);
      socket.off("stopTyping", handleStopTyping);
    };
  }, [socket, selectedUser]);

  useEffect(() => {
    if (messageEndRef.current) {
      requestAnimationFrame(() => {
        messageEndRef.current.scrollIntoView({
          behavior: initialLoadDone.current ? "smooth" : "auto",
        });
        initialLoadDone.current = true;
      });
    }
  }, [messages, isTyping]);

  



  if(isMessagesLoading){
    return(
      <div className="flex-1 flex flex-col overflow-auto">
        <ChatHeader />
        <MessageSkeleton />
        <MessageInput />
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-auto relative max-sm:pt-10 max-sm:-mt-3">
      <ChatHeader />

      <div className="flex-1 overflow-y-auto p-4 space-y-2 chat-scroll-container relative max-sm:bottom-14">
        {messages.map((message) => (
          <div
            key={message._id}
            className={`chat ${message.senderId === authUser._id ? "chat-end": "chat-start"}`}
             
            >
            <div className="chat-image avatar">
              <div className="size-10 rounded-full border border-gray-700">
                <img src={message.senderId === authUser._id ? authUser.profilePic || "/avatar.png" 
                          : selectedUser.profilePic || "/avatar.png"} alt="profile pic" />
              </div>
            </div>
            <div className="chat-header mb-1 "> 
              <time className="text-xs opacity-50 ml-1">{formatMessageTime(message.createdAt)}</time>
            </div>
            <div className={`chat-bubble flex flex-col ${message.senderId === authUser._id ? "bg-primary text-primary-content": "bg-base-300"}`}>
              {message.image && (
                <img src={message.image} alt="Attachment" className="sm:max-w-[200px] rounded-md mb-2" />
              )}
              {message.text && <p>{message.text}</p>}
              
              <div className={`chat-footer justify-end ${message.senderId === authUser._id ? "flex" : "hidden"}`}>

                {message.read ?  
                  <CheckCheck className="size-[1.2rem] text-primary-content/80" /> 
                  : <Check className="size-[1.2rem] text-primary-content/80"/>}
                
              </div>
                

            </div>

          </div>
        ))}

        {isTyping && (
          <div className="chat-start flex gap-3 animate-pulse">
            <div className="chat-image avatar">
              <div className="size-5 rounded-full border border-gray-700">
                <img src={messages.senderId === authUser._id ? authUser.profilePic || "/avatar.png" 
                          : selectedUser.profilePic || "/avatar.png"} alt="profile pic" />
              </div>
            </div>
            <div className="chat-bubble flex flex-col justify-center min-h-[0.5rem]">
            <p className="text-sm text-base-content/70">
                <i>typing... </i>
              </p>
            </div>
          </div>
        )}

        <div ref={messageEndRef}></div>    
        
        <ScrollToTheBottom/>

      </div>

       


      <MessageInput />

     
    </div>
  )
}

export default ChatContainer