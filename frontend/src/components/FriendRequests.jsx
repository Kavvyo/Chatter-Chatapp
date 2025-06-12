import { CircleX, UserCheck } from "lucide-react";
import { useFriendsStore } from "../store/useFriendsStore";

function FriendRequests() {
    const {pendingRequests, acceptRequest, cancelRequest} = useFriendsStore();

    const filteredRequests = pendingRequests.map(req => req.requester);


  return (
    <div className="bg-base-200">
      <div className={`flex items-center justify-center px-4 border border-gray-700 rounded-md`} >
            <div className="overflow-y-auto py-3 flex-col max-sm:items-center w-[20rem]">

                
                    {filteredRequests.map((user) => {
                      
                      return (
                        <div key={user._id} className="relative">
                          <div className="h-[3.5rem] w-[20rem] flex justify-between gap-3 rounded-md pl-5 pr-3
                                          max-sm:pl-3 max-sm:mb-5 max-sm:ml-0
                                          hover:bg-base-300 transition-colors border border-gray-800 mb-2">
                            
                            <div className="flex items-center gap-2">
                              <img
                                src={user.profilePic || "/avatar.png"}
                                alt={user.fullName}
                                className="size-10 object-cover rounded-full"
                              />
                              <div className="font-medium truncate">{user.fullName}</div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button className="p-2 hover:bg-base-200 rounded-full"
                                        onClick={() => cancelRequest(user._id)}>
                                    <CircleX className="h-5 w-5 text-red-600" />
                                </button>

                                <button className="p-2 hover:bg-base-200 rounded-full"
                                        onClick={() => acceptRequest(user._id)}>
                                    <UserCheck className="h-5 w-5 text-base-content" />
                                </button>

                            </div>

                          </div>
                        </div>
                      );
                    })}

                    {pendingRequests.length === 0 && (
                    <span>No pending friend requests</span>
                    )}
          </div>
       
    
    </div>
    </div>
  )
}

export default FriendRequests