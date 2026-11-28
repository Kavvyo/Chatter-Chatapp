import { createPortal } from "react-dom";
import { ChevronLeft, EllipsisVertical, Phone, Video } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useCallStore } from "../store/useCallStore";
import { useEffect, useRef, useState } from "react";
import VerticalMenu from "./VerticalMenu";
import AlertDialogBox from "./AlertDialogBox";

const ChatHeader = () => {
  const { selectedUser, setSelectedUser, typingUsers } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const { callUser } = useCallStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);

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

  if (!selectedUser) return null;

  const isOnline = onlineUsers.includes(selectedUser._id);
  const isTyping = Boolean(typingUsers?.[selectedUser._id]);

  return (
    <div className="relative z-30 px-3.5 py-2.5 border-b border-base-300/60 bg-base-100/95 backdrop-blur-sm max-sm:fixed max-sm:top-0 max-sm:left-0 max-sm:right-0 max-sm:z-40">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setSelectedUser(null)}
            className="hidden max-sm:flex size-8 rounded-full items-center justify-center hover:bg-base-200 transition-colors"
            aria-label="Back to chats"
          >
            <ChevronLeft className="size-5" />
          </button>

          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="size-10 rounded-full overflow-hidden ring-1 ring-base-300/80 bg-base-200">
              <img
                src={selectedUser.profilePic || "/avatar.png"}
                alt={selectedUser.fullName}
                className="w-full h-full object-cover"
              />
            </div>
            {isOnline && (
              <span className="absolute bottom-0 right-0 size-2.5 bg-emerald-500 rounded-full ring-2 ring-base-100" />
            )}
          </div>

          {/* User info */}
          <div className="min-w-0">
            <h3 className="font-semibold text-[15px] leading-tight truncate">
              {selectedUser.fullName}
            </h3>
            <p
              className={`text-xs leading-tight mt-0.5 truncate ${
                isTyping
                  ? "text-primary font-medium"
                  : isOnline
                  ? "text-emerald-500 font-medium"
                  : "text-base-content/55"
              }`}
            >
              {isTyping ? "typing..." : isOnline ? "Online" : "Offline"}
            </p>
          </div>
        </div>

        {/* Circular Soft Action Pills aligned with Mobile */}
        <div className="flex gap-1.5 items-center shrink-0">
          <button
            type="button"
            onClick={() => callUser(selectedUser, "voice")}
            className="size-9 rounded-full bg-base-200/85 hover:bg-base-300/80 text-base-content/85 hover:text-primary flex items-center justify-center transition-colors"
            title="Voice call"
            aria-label="Voice call"
          >
            <Phone className="size-[17px]" />
          </button>

          <button
            type="button"
            onClick={() => callUser(selectedUser, "video")}
            className="size-9 rounded-full bg-base-200/85 hover:bg-base-300/80 text-base-content/85 hover:text-primary flex items-center justify-center transition-colors"
            title="Video call"
            aria-label="Video call"
          >
            <Video className="size-[18px]" />
          </button>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="size-9 rounded-full bg-base-200/85 hover:bg-base-300/80 text-base-content/85 hover:text-primary flex items-center justify-center transition-colors"
              aria-label="More options"
            >
              <EllipsisVertical className="size-[17px]" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-11 z-50">
                <VerticalMenu
                  onCloseMenu={() => setMenuOpen(false)}
                  onOpenDialog={(dialog) => {
                    setMenuOpen(false);
                    setConfirmDialog(dialog);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Render Confirmation Dialog in a top-level Portal so header backdrop-blur never traps fixed positioning */}
      {confirmDialog &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setConfirmDialog(null)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <AlertDialogBox
                setAlertOpen={(open) => {
                  if (!open) setConfirmDialog(null);
                }}
                mainfunc={confirmDialog.mainfunc}
                btnTxt={confirmDialog.btnTxt}
                title={confirmDialog.title}
                description={confirmDialog.description}
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
export default ChatHeader;
