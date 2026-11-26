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

friendshipSchema.index({ requester: 1, recipient: 1, status: 1 });
friendshipSchema.index({ recipient: 1, requester: 1, status: 1 });
friendshipSchema.index({ recipient: 1, status: 1 });

const Friendship = mongoose.model("friendship", friendshipSchema);

export default Friendship;