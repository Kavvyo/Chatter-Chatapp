import { useState } from "react";
import { useChatStore } from "../store/useChatStore"
import { useFriendsStore } from "../store/useFriendsStore";
import AlertDialogBox from "./AlertDialogBox";

function VerticalMenu() {
    const{selectedUser, setSelectedUser, deleteAllMessages } = useChatStore();
    const { unfriendUser } = useFriendsStore();
    const [alertOpen, setAlertOpen ]= useState(false)
    const [mainFunc, setMainFunc] = useState(() => () => {});
    const [btnTxt, setBtnTxt] = useState("");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");

    const handleUnfriend = () => {
      setBtnTxt("Unfriend");
      setTitle ("Do you really want to unfriend?");
      setDescription("If you chose to unfriend, you have to request again to be a friend and exiting messages will be lost");
      setAlertOpen(true);
      setMainFunc(() => () => unfriendUser(selectedUser._id));
    }
    const handleDeleteCon = () => {
      setBtnTxt("Delete Messages");
      setTitle("Are you sure to delete the conversation?");
      setDescription("Your messages will be deleted permenetly");
      setAlertOpen(true);
      setMainFunc(() => () => deleteAllMessages(selectedUser._id));

    }

  return (
    <div>
        <ul className="menu bg-base-200 rounded-box w-56 font-semibold border border-gray-500 border-opacity-40">
            <li onClick={handleUnfriend}><a>Unfriend</a></li>
            <li onClick={handleDeleteCon}><a>Delete conversation</a></li>
            <li onClick={() => setSelectedUser(null)} className="max-sm:hidden"><a>Close Chat</a></li>
        </ul>

          
           {alertOpen && 
              <div className="fixed flex items-center justify-center min-h-[100%] min-w-[100%] top-0 right-0 backdrop-blur-[2px] bg-black bg-opacity-20">
                <AlertDialogBox 
                  setAlertOpen = {setAlertOpen} 
                  mainfunc={mainFunc} 
                  btnTxt = {btnTxt} 
                  title ={title} 
                  description= {description} 
                />
              </div>
            }

    </div>
  )
}

export default VerticalMenu