import { useEffect, useRef, useState } from "react";
import { Image, Send, Smile, X } from "lucide-react";
import toast from "react-hot-toast";
import debounce from "lodash.debounce";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import StickerPicker from "./StickerPicker";

function MessageInput() {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const { sendMessage, sendSticker, selectedUser } = useChatStore();
  const { socket } = useAuthStore();

  useEffect(() => {
    setShowStickerPicker(false);
  }, [selectedUser?._id]);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submitMessage = () => {
    const trimmedText = text.trim();
    const currentImage = imagePreview;
    if (!trimmedText && !currentImage) return;

    setText("");
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (selectedUser?._id) {
      socket?.emit("stopTyping", { to: selectedUser._id });
    }

    sendMessage({
      text: trimmedText,
      image: currentImage,
    });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    submitMessage();
  };

  const emitTyping = useRef(
    debounce((peerId, sock) => {
      if (peerId && sock) {
        sock.emit("typing", { to: peerId });
      }
    }, 300)
  ).current;

  const handleTextChange = (e) => {
    setText(e.target.value);
    if (!selectedUser?._id) return;

    emitTyping(selectedUser._id, socket);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket?.emit("stopTyping", { to: selectedUser._id });
    }, 800);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  };

  const firstName = selectedUser?.fullName?.split(" ")[0] || "chat";
  const canSend = Boolean(text.trim() || imagePreview);

  return (
    <div className="px-3 sm:px-4 pb-3 pt-1.5 w-full bg-base-100 max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:z-40">
      {imagePreview && (
        <div className="mb-2.5 flex items-center gap-2">
          <div className="relative">
            <img
              src={imagePreview}
              alt="Attachment preview"
              className="w-20 h-20 object-cover rounded-2xl border border-base-300 shadow-sm"
            />
            <button
              onClick={removeImage}
              className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-base-300 hover:bg-error hover:text-error-content flex items-center justify-center shadow transition-colors"
              type="button"
              aria-label="Remove image"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}

      {showStickerPicker && (
        <StickerPicker onSelectSticker={(sticker) => sendSticker(sticker)} />
      )}

      {/* Two-row Floating Rounded Composer Card aligned with Mobile */}
      <form
        onSubmit={handleSendMessage}
        className="rounded-[24px] bg-base-200/95 border border-base-300/80 shadow-sm px-3.5 pt-2.5 pb-2 flex flex-col gap-1.5"
      >
        <textarea
          rows={1}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowStickerPicker(false)}
          placeholder={`Message ${firstName}...`}
          className="w-full bg-transparent text-sm sm:text-[15px] leading-relaxed resize-none focus:outline-none max-h-28 placeholder:text-base-content/45"
        />

        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowStickerPicker((prev) => !prev)}
              className={`size-9 rounded-full flex items-center justify-center transition-colors ${
                showStickerPicker
                  ? "bg-primary/15 text-primary"
                  : "text-base-content/60 hover:bg-base-300/70 hover:text-base-content"
              }`}
              title="Stickers"
              aria-label="Stickers"
            >
              <Smile className="size-[19px]" />
            </button>

            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImageChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`size-9 rounded-full flex items-center justify-center transition-colors ${
                imagePreview
                  ? "bg-primary/15 text-primary"
                  : "text-base-content/60 hover:bg-base-300/70 hover:text-base-content"
              }`}
              title="Send photo"
              aria-label="Send photo"
            >
              <Image className="size-[19px]" />
            </button>
          </div>

          <button
            type="submit"
            disabled={!canSend}
            className={`size-9 rounded-full flex items-center justify-center transition-all ${
              canSend
                ? "bg-primary text-primary-content shadow-sm hover:brightness-110 active:scale-95"
                : "bg-base-300/80 text-base-content/35 cursor-not-allowed"
            }`}
            title="Send message"
            aria-label="Send message"
          >
            <Send className="size-[17px]" />
          </button>
        </div>
      </form>
    </div>
  );
}

export default MessageInput;
