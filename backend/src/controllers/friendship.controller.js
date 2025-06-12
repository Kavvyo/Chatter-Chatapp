import { getReciverSocketId, io } from "../lib/socket.js";
import Friendship from "../models/friendships.model.js"

export const getFriends = async (req, res) => {
    try {
        const myId = req.user._id;

        const friendships  = await Friendship.find({
            $or: [
              { requester: myId },
              { recipient: myId }
            ],
            status: "accepted"
          }).populate("requester", "-password")  // populate requester user data
          .populate("recipient", "-password"); // populate recipient user data
      
          const friends = friendships.map((friendship) => {
            const friend = friendship.requester._id.toString() === myId.toString()
              ? friendship.recipient
              : friendship.requester;
      
            return friend;
          });
        
        res.status(200).json(friends);

    } catch (error) {
        console.log('Error in get friends ', error.message);
        res.status(500).json({message: 'Internal Server Error'});
    }
};

export const sendFriendReqest = async (req, res) => {
     try {
        const {id: recipientId} = req.params;
        const requesterId = req.user._id;

        if (requesterId.toString() === recipientId) {
            return res.status(400).json({ message: "You cannot send a request to yourself." });
        }

        const existing = await Friendship.findOne({
            $or: [
              { requester: requesterId, recipient: recipientId },
              { requester: recipientId, recipient: requesterId }
            ]
          });
          
        if (existing) {
            return res.status(400).json({ message: "Friend request already sent" });
        }
    
        const newFriendship = new Friendship({
            requester: requesterId,
            recipient: recipientId,
            status: 'pending' 
        });
          
    
        await newFriendship.save();
    
        const reciverSocketId = getReciverSocketId(recipientId);
        if(reciverSocketId){
            await newFriendship.populate("requester", "-password");
            await newFriendship.populate("recipient", "-password");

            io.to(reciverSocketId).emit("newFriendship", newFriendship); 
        }
    
        res.status(200).json(newFriendship);
            
    } catch (error) {
        console.log('Error in sendMessages ', error.message);
        res.status(500).json({message: 'Internal Server Error'});
    }
};

export const acceptFriendRequest = async (req, res) => {
    try {
        const {id: requesterId } = req.params;
        const recipientId = req.user._id;
  
        const friendship = await Friendship.findOneAndUpdate(
                        { requester: requesterId, recipient: recipientId, status: "pending" },
                        { status: "accepted" },
                        { new: true }
        );
  
        if (!friendship) return res.status(404).json({ message: "Friend request not found." });
        res.status(200).json(friendship);

        const requesterSocketId = getReciverSocketId(requesterId);
        if(requesterSocketId){
            await friendship.populate("recipient", "-password");
            io.to(requesterSocketId).emit("acceptedFriendship", friendship); 
        }

    } catch (error) {
        console.log('Error in acceptFriendRequest', error.message);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const getIncomingRequests = async (req, res) => {
    try {
        const myId = req.user._id;

        const requests = await Friendship.find({
            recipient: myId,
            status: "pending"
        }).populate("requester", "-password");
        res.status(200).json(requests);
        
    } catch (error) {
        console.log('Error in getIncomingFriendRequests:', error.message);
        res.status(500).json({ message: 'Internal Server Error' });
    }

};

export const cancelRequest = async (req, res) => {
    try {
        const {id: requesterId } = req.params;
        const recipientId = req.user._id;

        const deleted = await Friendship.findOneAndDelete({
            requester: requesterId,
            recipient: recipientId,
            status: "pending"
        });

        if (!deleted) {
            return res.status(404).json({ message: "No pending request found" });
        }

        res.status(200).json({ message: "Friend request canceled" });
    } catch (error) {
        console.log("Error canceling request:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

export const unfriendUser = async (req, res) => {
    try {
        const {id: requesterId } = req.params;
        const recipientId = req.user._id;

        const deleted = await Friendship.findOneAndDelete({
            $or:[
                {requester: requesterId, recipient: recipientId, status: "accepted"},
                {requester: recipientId, recipient: requesterId, status: "accepted"},
            ]
        });

        if (!deleted) {
            return res.status(404).json({ message: "User is already unfriended" });
        }

        const requesterSocketId = getReciverSocketId(requesterId);
        if(requesterSocketId){
            io.to(requesterSocketId).emit("unfriendNotify"); 
        }

        res.status(200).json({ message: "User Unfriend succuess" });
    } catch (error) {
        console.log("Error unfried user:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
}


  