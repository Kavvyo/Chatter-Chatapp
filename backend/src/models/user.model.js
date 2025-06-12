import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            required: true
        },
        email: {
            type: String,
            lowercase: true,
            required: true,
            unique: true
        },
        password: {
            type: String,
            required: true,
            minlength: 6
        },
        profilePic: {
            type: String,
            default: ""
        },
        isVerified: {
            type: Boolean,
            required: true,
            default: false,
        },
        otpExpires: Date,
        otp: String,
    },
    { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;