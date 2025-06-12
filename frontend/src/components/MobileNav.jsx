import { LogOut, Settings, User, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";

function MobileNav({ menuOpen, setMenuOpen }) {
  const { logOut, authUser } = useAuthStore();


  return (
    <div
      onClick={() => setMenuOpen(false)}
      className={`fixed top-0 left-0 w-full h-screen z-40 bg-base-100 bg-opacity-80 backdrop-blur-[8px]
      transition-all duration-100 ease-in-out
      ${menuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
    >
      <button
        onClick={() => {
          setMenuOpen(false);
          
        }}
        className="text-[2.5rem] absolute right-6 top-0 text-white focus:outline-none cursor-pointer"
      >
        &times;
      </button>

      
        <div className="flex flex-col gap-4 items-center justify-center h-full">

          <Link to="/settings" className="btn h-[4rem] w-[20rem] bg-transparent/10 border-x-0">
            <Settings className="size-7" />
            <span className="text-[1rem]">Settings</span>
          </Link>

          {authUser && authUser.isVerified && (
            <Link to="/profile" className="btn h-[4rem] w-[20rem] bg-transparent/10 border-x-0">
              <User className="size-7" />
              <span className="text-[1rem]">Profile</span>
            </Link>
          )}

          {authUser && (
            <button className="btn h-[4rem] w-[20rem] bg-transparent/10 border-x-0" onClick={logOut}>
              <LogOut className="size-7" />
              <span className="text-[1rem]">Log out</span>
            </button>
          )}
        </div>
      
    </div>
  );
}


export default MobileNav