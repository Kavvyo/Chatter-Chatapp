import { useState } from "react";
import { useAuthStore } from "../store/useAuthStore"
import { Camera, Mail, User } from "lucide-react";
import toast from "react-hot-toast";

function ProfilePage() {
  const {authUser, isUpdatingProfile, updateProfile, updateFullname} = useAuthStore();
  const [selectedImg, setSelectedImg] = useState(null);
  const [editName, setEditName] = useState(false);
  const [text, setText] = useState("");

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if(!file) return;

    const reader = new FileReader();

    reader.readAsDataURL(file);

    reader.onload = async () => {
      const base64Image = reader.result;
      setSelectedImg(base64Image);
      await updateProfile({profilePic: base64Image});
    };
  };

  const handleUpdateFullname = async (e) => {
    e.preventDefault();
    if (!text.trim() ) return;

    try {
      await updateFullname({ fullName: text.trim() });
      setEditName(false);

    } catch (error) {
      toast.error("Failed to update fullname", error);
  
    }

  }

  const handleTextOnchange = (e) => {
    setText(e.target.value);
  }



  return (
    <div className="h-screen pt-10">
    <div className="max-w-2xl mx-auto p-4 py-8">
      <div className="bg-base-300 rounded-xl p-6 space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold ">Profile</h1>
          <p className="mt-2">Your profile information</p>
        </div>

        {/* avatar upload section */}

        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <img
              src={selectedImg || authUser.profilePic || "/avatar.png"}
              alt="Profile"
              className="size-32 rounded-full object-cover border-4 "
            />
            <label
              htmlFor="avatar-upload"
              className={`
                absolute bottom-0 right-0 
                bg-base-content hover:scale-105
                p-2 rounded-full cursor-pointer 
                transition-all duration-200
                ${isUpdatingProfile ? "animate-pulse pointer-events-none" : ""}
              `}
            >
              <Camera className="w-5 h-5 text-base-200" />
              <input
                type="file"
                id="avatar-upload"
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={isUpdatingProfile}
              />
            </label>
          </div>
          <p className="text-sm text-zinc-400">
            {isUpdatingProfile ? "Uploading..." : "Click the camera icon to update your photo"}
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-1.5">
            <div className="text-sm text-zinc-400 flex items-center gap-2">
              <User className="w-4 h-4" />
              Full Name
            </div>

            {/* <p className="px-4 py-2.5 bg-base-200 rounded-lg border">{authUser?.fullName}</p> */}

              <form  onSubmit={handleUpdateFullname}>
                <div className="relative flex items-center">

                  <input 
                    type="text" 
                    disabled={!editName}
                    className="px-4 py-2.5 bg-base-200 rounded-lg border w-full"
                    placeholder={authUser?.fullName}
                    value={text}
                    onChange={handleTextOnchange}
                    />

                    <div className="absolute right-1 flex gap-1">
                      {editName ? (
                        <>
                          <button
                            type="submit"
                            className="btn min-h-[2.5rem] h-[2.5rem] w-[2.8rem]"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditName(false);
                              setText(""); 
                            }}
                            className="btn min-h-[2.5rem] h-[2.5rem] w-[2.8rem] px-[1.6rem]"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditName(true);
                            setText("");
                          }}

                          className="btn min-h-[2.5rem] h-[2.5rem] w-[2.8rem]"
                        >
                          Edit
                        </button>
                      )}
                    </div>


                </div>
              </form>


          </div>

          <div className="space-y-1.5">
            <div className="text-sm text-zinc-400 flex items-center gap-2 justify-between">

              <div className="flex gap-2 items-center">
                <Mail className="w-4 h-4" />
                Email Address
              </div>
              <span className="italic text-[0.7rem] text-warning"> • you can't change the email</span>

            </div>

            <p className="px-4 py-2.5 bg-base-200 rounded-lg border">{authUser?.email}</p>
          </div>
        </div>

        <div className="mt-6 bg-base-300 rounded-xl p-6">
          <h2 className="text-lg font-medium  mb-4">Account Information</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between py-2 border-b border-zinc-700">
              <span>Member Since</span>
              <span>{authUser.createdAt?.split("-")[0]}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span>Account Status</span>
              <div className="flex flex-row items-center">
              <div className="size-2 rounded-full bg-green-500 mx-1 animate-pulse"></div>
              <span className="text-green-500">Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}

export default ProfilePage