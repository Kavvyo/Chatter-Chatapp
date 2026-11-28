import mongoose from "mongoose";

const pendingStickerSchema = new mongoose.Schema(
  {
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    messageId: {
      type: String,
      required: true,
      unique: true,
    },
    stickerHash: {
      type: String,
      required: true,
    },
    isAnimated: {
      type: Boolean,
      default: false,
    },
    width: {
      type: Number,
      default: 512,
    },
    height: {
      type: Number,
      default: 512,
    },
    dataBase64: {
      type: String,
      default: null,
    },
    clientCreatedAt: {
      type: String,
      default: () => new Date().toISOString(),
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 60 * 60 * 24 * 7, // Auto-expire uncollected stickers after 7 days
    },
  },
  { versionKey: false }
);

pendingStickerSchema.index({ to: 1, createdAt: 1 });
pendingStickerSchema.index({ from: 1, to: 1 });

const PendingSticker = mongoose.model("PendingSticker", pendingStickerSchema);

export default PendingSticker;
