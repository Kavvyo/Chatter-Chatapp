import express from 'express';
import { protectRoute } from '../middleware/auth.middleware.js';
import { deleteAllMessages, getMessages, getUserForSidebar, markMessagesAsRead, sendMessages, sendStickerHttp, unreadCounts } from '../controllers/message.controller.js';

const router = express.Router();

router.get("/users", protectRoute, getUserForSidebar);
router.get("/unreadcounts", protectRoute, unreadCounts);
router.get("/:id", protectRoute, getMessages);

router.post('/send/:id', protectRoute, sendMessages);
router.post('/sticker/:id', protectRoute, sendStickerHttp);

router.put('/read/:id', protectRoute, markMessagesAsRead);



router.delete('/deleteAll/:id', protectRoute, deleteAllMessages);

export default router;