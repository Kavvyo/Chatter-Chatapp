import { useChatStore } from "../store/useChatStore";
import { useSearchStore } from "../store/useSearchStore";
import { useFriendsStore } from '../store/useFriendsStore'
import { Search, UserPlus } from "lucide-react";

function SearchContainer() {

    const {users} = useChatStore();
    const { searchQuery, setSearchQuery } = useSearchStore();
    const {friends, sendRequest} = useFriendsStore();


    const filteredUsers = users.filter((user) => {
        const name = user.fullName.toLowerCase();
        const query = searchQuery.toLowerCase();
        
        if (!query) return false;
        
        
        
        return (
            name.startsWith(query)
        );
    });
  return (
    <div className="bg-base-200">
      <div className={`flex items-center justify-center px-4 border border-gray-700 rounded-md`} >
            <div className="overflow-y-auto w-full py-3 flex-col max-sm:items-center">

                <div className=" justify-center relative mb-3 flex">
                        <div className="relative w-[18rem]">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-base-content/40" />
                            </div>
                            <input
                            type="text"
                            className="input input-bordered pl-10 h-10 text-sm w-full"
                            placeholder="Search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    {filteredUsers.map((user) => {
                      const isAlreadyFriend = friends.some(friend => friend._id === user._id);
                      

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

                            {!isAlreadyFriend ? (
                              <button className="p-2 hover:bg-base-200 rounded-full"
                                      onClick={() => sendRequest(user._id)}>
                                <UserPlus className="h-5 w-5 text-base-content" />
                              </button>
                            ) : <span className="label-text text-sm mt-4">Friends</span>}
                          </div>
                        </div>
                      );
                    })}


                {!searchQuery || filteredUsers.length === 0 && (
                <div className="text-center text-zinc-500 py-10  w-[20rem]">
                  No users found : {searchQuery}
                </div>
                )}
          </div>
       
    
    </div>
    </div>
  )
}

export default SearchContainer