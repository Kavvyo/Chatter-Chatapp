import { Link } from "react-router-dom";
import { LogOut, MessageSquare, Search, Settings, User, Users } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import SearchContainer from "./SearchContainer";
import { useEffect, useRef, useState } from "react";
import FriendRequests from "./FriendRequests";
import { useFriendsStore } from "../store/useFriendsStore";
import Logo from '../assets/logo';

function Navbar({setMenuOpen}) {
  const {logOut, authUser} = useAuthStore();
  const {pendingRequests} = useFriendsStore();
  const [isFocused, setIsFocused] = useState(false);
  const [fReqs, setFReqs] = useState(false);
  const [mobFReqs, setMobFReqs] = useState(false);


  const searchRef = useRef(null);
  const friendRqRef = useRef(null);
  const mobFriendRqRef = useRef(null);

  const handleClick = () => {
    setFReqs((prev) => !prev);
    setMobFReqs((prev) => !prev);
  };


  useEffect(() => {
    function handleClickOutside(event) {
      if(searchRef.current && !searchRef.current.contains(event.target)){
        setIsFocused(false)
      }
      if(friendRqRef.current && !friendRqRef.current.contains(event.target)){
        setFReqs(false)
      }

      if (
        friendRqRef.current &&
        !friendRqRef.current.contains(event.target) &&
        mobFriendRqRef.current &&
        !mobFriendRqRef.current.contains(event.target)
      ) 
        {
          setFReqs(false);
          setMobFReqs(false);
        }
    }
  
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);


  return (
    <header className="bg-base-100 border-b border-base-300 fixed w-full top-0 z-40 backdrop-blur-lg bg-base-100/80">
      <div className="container mx-auto px-5 h-14 flex items-center justify-between lg:px-0">
    
        {/* Left: Logo */}
        <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-all">
          <div className="size-9 rounded-lg bg-primary/10 items-center justify-center flex">
            {/* <MessageSquare className="w-5 h-5 text-primary " /> */}

            <Logo />
          </div>
          <h1 className="text-lg font-bold ">Chatter</h1>
        </Link>

        <div className="flex items-center gap-2">
         
            <div ref={searchRef} className="relative items-center gap-2 flex">
              {authUser && authUser.isVerified && <button
                className="btn btn-sm gap-2 transition-colors"
                onClick={() => setIsFocused((prev) => !prev)}
              >
                <Search className="w-4 h-4" />
              <span>Search</span>

              </button>}

              {isFocused && (
                <div className="absolute top-full left-1/2 max-sm:left-[1.6rem] 
                                transform -translate-x-1/2 mt-3 max-h-[24.5rem] overflow-y-auto 
                                bg-base-100 shadow-lg rounded-md z-50 flex">
                  <SearchContainer />
                </div>
              )}
            </div>

            <div ref={friendRqRef} className="relative items-center gap-2 flex">
              {authUser && authUser.isVerified && <button className="btn btn-sm "
                onClick={handleClick}
                >
                  <Users className="size-5" />
                  <span className="hidden sm:inline">Friend requests</span>

                {pendingRequests.length > 0 &&
                <div className="absolute flex size-4 -top-1 -right-1 rounded-full bg-red-500 justify-center items-center p-2">
                  <p className="text-center text-primary-content">{pendingRequests.length}</p>
                </div>}


                </button>}
              {fReqs && (
                <div className="absolute max-sm:hidden left-1/2 transform -translate-x-1/2 top-full mt-3 
                                max-h-[24.5rem] overflow-y-auto bg-base-100 shadow-lg rounded-md z-50 flex">
                  <FriendRequests />
                </div>
              )}

            </div>
             


          <div className="flex items-center gap-2 max-sm:hidden">
            <Link to="/settings" className="btn btn-sm gap-2 transition-colors">
              <Settings className="w-4 h-4" />
              <span className="hidden max-sm:inline">Settings</span>
            </Link>

            {authUser && authUser.isVerified && (
              <Link to="/profile" className="btn btn-sm gap-2 max-sm:hidden">
                <User className="size-5" />
                <span className="hidden max-sm:inline">Profile</span>
              </Link>
            )}

            {authUser && (
              <button className="flex items-center max-sm:hidden" onClick={logOut}>
                <LogOut className="size-5" />
              </button>
            )}

          </div>
           <div className={`flex items-center h-14 px-2 justify-between font-bold text-2xl lg:hidden md:hidden sm:hidden`}>
                    <span onClick={() => setMenuOpen((prev) => !prev)} className={`text-[1.4rem]`}>&#9776;</span>
            </div>

        </div>
        
      </div>
      
         {mobFReqs && (
          <div className="lg:hidden flex flex-col items-center p-4 h-screen overflow-y-auto overflow-hidden">
            <h2 className="text-2xl font-bold mb-8 text-center">Friend Requests</h2>
            <div className="w-[23rem]">
              <FriendRequests />
            </div>
          </div>
        )}



    </header>
  )
}

export default Navbar