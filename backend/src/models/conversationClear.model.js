import mongoose from "mongoose";

const conversationClearSchema = new mongoose.Schema(
  {
    participantsKey: {
      type: String,
      required: true,
      unique: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    clearedAt: {
      type: Date,
      required: true,
    },
    clearedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

conversationClearSchema.index({ participants: 1 });

export function getConversationPairKey(userA, userB) {
  return [userA.toString(), userB.toString()].sort().join("_");
}

const ConversationClear = mongoose.model("ConversationClear", conversationClearSchema);
export default ConversationClear;
