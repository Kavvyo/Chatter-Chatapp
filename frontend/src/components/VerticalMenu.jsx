import { Trash2, UserMinus, X } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useFriendsStore } from "../store/useFriendsStore";

function VerticalMenu({ onCloseMenu, onOpenDialog }) {
  const { selectedUser, setSelectedUser, deleteAllMessages } = useChatStore();
  const { unfriendUser } = useFriendsStore();

  if (!selectedUser) return null;

  const handleUnfriend = () => {
    const targetId = selectedUser._id;
    onOpenDialog?.({
      btnTxt: "Unfriend",
      title: "Unfriend this contact?",
      description:
        "If you unfriend, you will need to send a new friend request and existing messages will be removed.",
      mainfunc: () => unfriendUser(targetId),
    });
  };

  const handleDeleteCon = () => {
    const targetId = selectedUser._id;
    onOpenDialog?.({
      btnTxt: "Delete Conversation",
      title: "Delete conversation?",
      description:
        "All messages and stickers in this chat will be permanently cleared for both users.",
      mainfunc: () => deleteAllMessages(targetId),
    });
  };

  const handleCloseChat = () => {
    onCloseMenu?.();
    setSelectedUser(null);
  };

  return (
    <ul className="menu p-1.5 bg-base-200 rounded-2xl w-56 text-sm font-medium border border-base-300 shadow-xl">
      <li>
        <button
          type="button"
          onClick={handleDeleteCon}
          className="flex items-center gap-2.5 text-error hover:bg-error/10 rounded-xl"
        >
          <Trash2 className="size-4" />
          <span>Delete conversation</span>
        </button>
      </li>
      <li>
        <button
          type="button"
          onClick={handleUnfriend}
          className="flex items-center gap-2.5 rounded-xl"
        >
          <UserMinus className="size-4" />
          <span>Unfriend</span>
        </button>
      </li>
      <li className="max-sm:hidden">
        <button
          type="button"
          onClick={handleCloseChat}
          className="flex items-center gap-2.5 rounded-xl"
        >
          <X className="size-4" />
          <span>Close Chat</span>
        </button>
      </li>
    </ul>
  );
}

export default VerticalMenu;
