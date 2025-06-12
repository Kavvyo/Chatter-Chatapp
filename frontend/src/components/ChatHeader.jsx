import { ChevronLeft, EllipsisVertical, Video, X } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useEffect, useRef, useState } from "react";
import VerticalMenu from "./VerticalMenu";

const ChatHeader = ({setAlertOpen}) => {
  const { selectedUser, setSelectedUser } = useChatStore();
  const {onlineUsers } = useAuthStore();
  const[menuOpen, setMenuOpen] = useState(false);

  const menuRef = useRef(null);

  useEffect(() => {
      function handleClickOutside(event) {
        if (menuRef.current && !menuRef.current.contains(event.target)) {
          setMenuOpen(false);
        }
      }
    
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, []);



  return (
    <div className="relative p-2.5 border-b border-base-300 max-sm:fixed max-sm:top-0 max-sm:left-0 max-sm:right-0 max-sm:z-40 max-sm:bg-base-100">
      <div className="flex items-center justify-between  ">
        <div className="flex items-center gap-3">
          <div className="hidden max-sm:block">
            <button onClick={() => setSelectedUser(null)}>
              <ChevronLeft className=" mx-0" />
            </button>
          </div>
          {/* Avatar */}
          <div className="avatar">
            <div className="size-10 rounded-full relative">
              <img src={selectedUser.profilePic || "/avatar.png"} alt={selectedUser.fullName} />
            </div>
            {onlineUsers.includes(selectedUser._id) && (
                <span
                  className="absolute bottom-0 right-0 size-3 bg-green-500 
                  rounded-full ring-2 ring-zinc-900"
                />
              )}
          </div>

          {/* User info */}
          <div>
            <h3 className="font-medium">{selectedUser.fullName}</h3>
            <p className="text-sm text-base-content/70">
              {onlineUsers.includes(selectedUser._id)
                ? "Online"
                : "Offline"}
            </p>
          </div>
        </div>

              <div className="flex gap-5 items-center">
              
                
                <div ref={menuRef}>

                  <button onClick={() => setMenuOpen((prev) => !prev)}>
                    <EllipsisVertical />
                  </button>
                  
                  {menuOpen && (
                    <div className="fixed flex right-[3.5rem] max-sm:right-[1.5rem] z-30">
                        <VerticalMenu setAlertOpen = {setAlertOpen}/>
                    </div>
                  )}
                
                 </div>
              </div>
              

          
      </div>
    </div>
  );
};
export default ChatHeader;