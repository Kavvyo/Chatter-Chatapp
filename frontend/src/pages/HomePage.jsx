import { useChatStore } from "../store/useChatStore"
import Sidebar from "../components/Sidebar";
import MobileSidebar from "../components/MobileSidebar";
import NoChatSelected from "../components/NoChatSelected";
import ChatContainer from "../components/ChatContainer";
import { useEffect } from "react";
import { useFriendsStore } from "../store/useFriendsStore";

function HomePage() {
  const {selectedUser, subscribeToMessages, unSubscribeFromMessages, fetchUnreadCounts} = useChatStore();
  const {subscribeToFriendReqests, unSubscribeFromFriendReqests, getPendingRequests} = useFriendsStore();


  useEffect(() => {
    subscribeToMessages();
    subscribeToFriendReqests();

    return () => {
      unSubscribeFromMessages();
      unSubscribeFromFriendReqests();
    };
  });

  useEffect(() => {
      getPendingRequests();
      fetchUnreadCounts();
  },[getPendingRequests, fetchUnreadCounts]);


  return (
    <div className="h-screen bg-base-200 ">
      <div className="flex items-center justify-center pt-20 px-4 max-sm:px-2">
        <div className="bg-base-100 rounded-lg shadow-xl w-full max-w-7xl h-[calc(100vh-6rem)]">
          <div className="flex h-full rounded-lg overflow-hidden max-sm:hidden">
            <Sidebar />

            {!selectedUser ? <NoChatSelected /> : <ChatContainer />}
          </div>

          <div className="sm:hidden lg:hidden flex relative">
            <MobileSidebar />

            {selectedUser && 

            <div className="bg-base-200 absolute top-0 left-0 min-h-screen min-w-full flex justify-center items-center ">
              <ChatContainer />
            </div>
            
            }

          </div>

        </div>
      </div>
    </div>
  )
}

export default HomePage