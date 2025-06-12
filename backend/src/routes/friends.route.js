import express from 'express';
import { protectRoute } from '../middleware/auth.middleware.js';
import {acceptFriendRequest, cancelRequest, getFriends, getIncomingRequests, sendFriendReqest, unfriendUser} from '../controllers/friendship.controller.js'

const router = express.Router();

router.get("/getfriends", protectRoute, getFriends);
router.get("/pendingReqs", protectRoute, getIncomingRequests);
router.post("/request/:id", protectRoute, sendFriendReqest);
router.post("/accept/:id", protectRoute, acceptFriendRequest);

router.delete("/cancel/:id", protectRoute, cancelRequest);
router.delete("/unfriend/:id", protectRoute, unfriendUser);


export default router;