import mongoose from "mongoose";

const friendshipSchema = new mongoose.Schema(
    {
        requester: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        status: {
            type: String,
            enum: ["pending", "accepted", "blocked"],
            default: "pending",
        },
    },
    { timestamps: true }
);

const Friendship = mongoose.model("friendship", friendshipSchema);

export default Friendship;