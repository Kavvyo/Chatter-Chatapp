import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookmarkCheck,
  BookmarkPlus,
  Check,
  CheckCheck,
  Clock,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useStickerStore } from "../store/useStickerStore";
import { usePrivacyStore } from "../store/usePrivacyStore";
import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./Skeletons/MessageSkeleton";
import ScrollToTheBottom from "./ScrollToTheBottom";
import { formatMessageTime } from "../lib/utils";

function StickerTransferRing({ mode }) {
  return (
    <div className="relative size-11 rounded-full bg-black/70 backdrop-blur-sm flex items-center justify-center shadow-lg">
      <svg className="absolute inset-0 size-11 animate-spin" viewBox="0 0 44 44">
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="2.5"
        />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="42 75"
          className="text-primary"
        />
      </svg>
      {mode === "upload" ? (
        <ArrowUp className="size-4 text-white stroke-[2.5]" />
      ) : (
        <ArrowDown className="size-4 text-white stroke-[2.5]" />
      )}
    </div>
  );
}

function ChatContainer() {
  const {
    messages,
    getMessages,
    isMessagesLoading,
    selectedUser,
    typingUsers,
  } = useChatStore();
  const { authUser } = useAuthStore();
  const { packs, saveStickerToCollection } = useStickerStore();
  const { protectScreenshots } = usePrivacyStore();

  const [previewSticker, setPreviewSticker] = useState(null);
  const [savingSticker, setSavingSticker] = useState(false);

  const savedHashes = useMemo(() => {
    const hashes = new Set();
    for (const pack of packs) {
      for (const s of pack.stickers || []) {
        if (s.stickerHash) hashes.add(s.stickerHash);
      }
    }
    return hashes;
  }, [packs]);

  const messageEndRef = useRef(null);
  const initialLoadDone = useRef(false);
  const mountTimeRef = useRef(Date.now());

  const isTyping = Boolean(selectedUser?._id && typingUsers?.[selectedUser._id]);

  useEffect(() => {
    if (!protectScreenshots) {
      document.body.classList.remove("privacy-block-print");
      return;
    }
    document.body.classList.add("privacy-block-print");
    return () => document.body.classList.remove("privacy-block-print");
  }, [protectScreenshots]);

  useEffect(() => {
    initialLoadDone.current = false;
    mountTimeRef.current = Date.now();
    getMessages(selectedUser._id);
  }, [selectedUser._id, getMessages]);

  useEffect(() => {
    if (messageEndRef.current) {
      requestAnimationFrame(() => {
        messageEndRef.current?.scrollIntoView({
          behavior: initialLoadDone.current ? "smooth" : "auto",
        });
        initialLoadDone.current = true;
      });
    }
  }, [messages.length, isTyping]);

  const handleSaveSticker = async (stickerMsg, e) => {
    if (e) e.stopPropagation();
    if (!stickerMsg?.stickerHash || savingSticker) return;
    setSavingSticker(true);
    const res = await saveStickerToCollection({
      stickerHash: stickerMsg.stickerHash,
      stickerUri: stickerMsg.stickerUri,
      isAnimated: stickerMsg.isAnimated,
    });
    setSavingSticker(false);
    if (res.ok) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  };

  if (isMessagesLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-auto">
        <ChatHeader />
        <MessageSkeleton />
        <MessageInput />
      </div>
    );
  }

  const firstName = selectedUser?.fullName?.split(" ")[0] || "them";
  const previewIsSaved = Boolean(
    previewSticker?.stickerHash && savedHashes.has(previewSticker.stickerHash)
  );

  return (
    <div className="flex-1 flex flex-col overflow-auto relative max-sm:pt-12 max-sm:-mt-2">
      <ChatHeader />

      <div
        onContextMenu={(e) => {
          if (protectScreenshots) e.preventDefault();
        }}
        className={`flex-1 overflow-y-auto px-3.5 sm:px-5 py-4 space-y-2.5 chat-scroll-container relative max-sm:pb-28 ${
          protectScreenshots ? "privacy-protected-media" : ""
        }`}
      >
        {messages.length === 0 && !isTyping ? (
          <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center px-6 select-none">
            <div className="size-20 rounded-full overflow-hidden ring-2 ring-base-300 shadow-md bg-base-200 mb-3.5">
              <img
                src={selectedUser.profilePic || "/avatar.png"}
                alt={selectedUser.fullName}
                className="w-full h-full object-cover"
              />
            </div>
            <h3 className="text-lg font-semibold tracking-tight">
              {selectedUser.fullName}
            </h3>
            <p className="text-sm text-base-content/55 mt-1">
              Say hello to {firstName}
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const isSender = message.senderId === authUser?._id;
            const isFreshLive = Boolean(
              message.clientCreatedAt && message.clientCreatedAt >= mountTimeRef.current
            );
            const animClass = isFreshLive
              ? message.isSticker
                ? "sticker-pop-in"
                : "msg-pop-in"
              : "";

            const isUploading = message.isSticker && message.stickerStatus === "uploading";
            const isDownloading =
              message.isSticker && message.stickerStatus === "downloading";
            const isQueued = message.isSticker && message.stickerStatus === "queued";
            const isSaved = Boolean(
              message.stickerHash && savedHashes.has(message.stickerHash)
            );

            return (
              <div
                key={message.localId || message._id}
                className={`chat ${isSender ? "chat-end" : "chat-start"} ${animClass}`}
              >
                <div className="chat-image avatar">
                  <div className="size-9 rounded-full ring-1 ring-base-300/80 bg-base-200">
                    <img
                      src={
                        isSender
                          ? authUser.profilePic || "/avatar.png"
                          : selectedUser.profilePic || "/avatar.png"
                      }
                      alt="profile pic"
                    />
                  </div>
                </div>

                {message.isSticker ? (
                  <div
                    className={`flex flex-col ${isSender ? "items-end" : "items-start"}`}
                  >
                    {message.stickerUri ? (
                      <div
                        className="group relative cursor-pointer"
                        onClick={() => setPreviewSticker(message)}
                      >
                        <img
                          src={message.stickerUri}
                          alt="Sticker"
                          draggable={!protectScreenshots}
                          className={`w-36 h-36 sm:w-40 sm:h-40 object-contain select-none bg-transparent transition-opacity ${
                            isUploading || isDownloading ? "opacity-75" : ""
                          }`}
                        />

                        {(isUploading || isDownloading) && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <StickerTransferRing
                              mode={isUploading ? "upload" : "download"}
                            />
                          </div>
                        )}

                        {!isUploading && !isDownloading && (
                          <button
                            type="button"
                            onClick={(e) => handleSaveSticker(message, e)}
                            disabled={isSaved}
                            className={`absolute top-1.5 right-1.5 px-2 py-1 rounded-full text-[11px] font-medium inline-flex items-center gap-1 shadow transition-opacity ${
                              isSaved
                                ? "bg-base-300/90 text-base-content/80 opacity-0 group-hover:opacity-100"
                                : "bg-black/75 text-white hover:bg-primary opacity-0 group-hover:opacity-100"
                            }`}
                            title={isSaved ? "Saved in Chatter" : "Save sticker to Chatter"}
                          >
                            {isSaved ? (
                              <>
                                <BookmarkCheck className="size-3" />
                                <span>Saved</span>
                              </>
                            ) : (
                              <>
                                <BookmarkPlus className="size-3" />
                                <span>Save</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-2xl bg-base-200/80 animate-pulse flex flex-col items-center justify-center gap-2 text-xs text-base-content/65">
                        <StickerTransferRing mode="download" />
                        <span>Downloading...</span>
                      </div>
                    )}

                    <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-base-200/85 text-[10px] text-base-content/60">
                      <span>{formatMessageTime(message.createdAt)}</span>
                      {isSender &&
                        (isQueued ? (
                          <Clock className="size-3" />
                        ) : isUploading ? (
                          <ArrowUp className="size-3 text-primary animate-pulse" />
                        ) : message.read ? (
                          <CheckCheck className="size-3 text-primary" />
                        ) : (
                          <Check className="size-3" />
                        ))}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`chat-bubble flex flex-col shadow-sm ${
                      isSender
                        ? "bg-primary text-primary-content rounded-[20px] rounded-br-md"
                        : "bg-base-200 text-base-content rounded-[20px] rounded-bl-md"
                    }`}
                  >
                    {message.image && (
                      <img
                        src={message.image}
                        alt="Attachment"
                        draggable={!protectScreenshots}
                        className="sm:max-w-[220px] rounded-xl mb-1.5"
                      />
                    )}
                    {message.text && (
                      <p className="whitespace-pre-wrap break-words leading-relaxed">
                        {message.text}
                      </p>
                    )}

                    <div
                      className={`flex items-center gap-1 mt-1 text-[10px] ${
                        isSender
                          ? "justify-end text-primary-content/75"
                          : "justify-start text-base-content/55"
                      }`}
                    >
                      <span>{formatMessageTime(message.createdAt)}</span>
                      {isSender &&
                        (message._id?.toString().startsWith("temp_") ? (
                          <Clock className="size-3" />
                        ) : message.read ? (
                          <CheckCheck className="size-3.5" />
                        ) : (
                          <Check className="size-3.5" />
                        ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {isTyping && (
          <div className="chat chat-start msg-pop-in">
            <div className="chat-image avatar">
              <div className="size-9 rounded-full ring-1 ring-base-300/80 bg-base-200">
                <img
                  src={selectedUser.profilePic || "/avatar.png"}
                  alt="profile pic"
                />
              </div>
            </div>
            <div className="chat-bubble bg-base-200 rounded-[20px] rounded-bl-md flex items-center gap-1.5 py-3 px-4">
              <span className="size-2 rounded-full bg-base-content/55 animate-bounce [animation-delay:0ms]" />
              <span className="size-2 rounded-full bg-base-content/55 animate-bounce [animation-delay:150ms]" />
              <span className="size-2 rounded-full bg-base-content/55 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={messageEndRef} />
        <ScrollToTheBottom />
      </div>

      {/* Sticker Preview & Save-to-Chatter Lightbox Modal */}
      {previewSticker && (
        <div
          onContextMenu={(e) => {
            if (protectScreenshots) e.preventDefault();
          }}
          className={`fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-in fade-in duration-150 ${
            protectScreenshots ? "privacy-protected-media" : ""
          }`}
          onClick={() => setPreviewSticker(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewSticker(null)}
            className="absolute top-5 right-5 size-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
            aria-label="Close sticker preview"
          >
            <X className="size-5" />
          </button>

          {previewSticker.stickerUri && (
            <img
              src={previewSticker.stickerUri}
              alt="Sticker preview"
              draggable={!protectScreenshots}
              className="w-52 h-52 sm:w-60 sm:h-60 object-contain select-none"
              onClick={(e) => e.stopPropagation()}
            />
          )}

          <button
            type="button"
            disabled={previewIsSaved || savingSticker}
            onClick={(e) => handleSaveSticker(previewSticker, e)}
            className={`mt-6 px-5 py-2.5 rounded-full font-semibold text-sm inline-flex items-center gap-2 shadow-xl transition-all ${
              previewIsSaved
                ? "bg-white/15 text-white/90 cursor-default"
                : "bg-primary text-primary-content hover:brightness-110 active:scale-95"
            }`}
          >
            {previewIsSaved ? (
              <>
                <BookmarkCheck className="size-4" />
                <span>Saved in Chatter</span>
              </>
            ) : (
              <>
                <BookmarkPlus className="size-4" />
                <span>{savingSticker ? "Saving..." : "Save to Chatter"}</span>
              </>
            )}
          </button>
        </div>
      )}

      <MessageInput />
    </div>
  );
}

export default ChatContainer;
