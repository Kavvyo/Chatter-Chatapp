import bcrypt from 'bcryptjs';
import User from '../models/user.model.js';
import cloudinary from '../lib/cloudinary.js'
import { genrateToken } from '../lib/utils.js';
import {sendEmail} from '../lib/sendEmail.js'

export const signup = async (req, res) => {
    const {fullName, email, password} = req.body;
    try {
        if(!fullName || !email ||!password){
            return res.status(400).json({message: "All fileds are required"});
        }

        if(password.length < 6){
            return res.status(400).json({message: "Password must be at least 6 characters"});
        }

        const user = await User.findOne({email})
        if(user) return res.status(400).json({message: "Email already exists"});

        const salt = await bcrypt.genSalt(10);
        const hashPassword = await bcrypt.hash(password, salt);

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedOtp = await bcrypt.hash(otp, 10);

        const newUser= new User({
            fullName,
            email,
            password: hashPassword,
            otp: hashedOtp,
            otpExpires: new Date(Date.now() + 1 * 60 * 1000),
            isVerified: false
        });

        if(newUser){
            await sendEmail(email, otp);
            genrateToken(newUser._id, res);
            await newUser.save();

            res.status(201).json({
                _id: newUser._id,
                fullName: newUser.fullName,
                email: newUser.email,
                profilePic: newUser.profilePic,
            })
        }
        else{
            res.status(400).json({message: "Invalid user data"})
        }
        
    } catch (error) {
        console.log('Error signup controller', error.message);
        res.status(500).json({message: 'Internal Server Error'});
    }
};

export const login = async (req, res) => {
    const {email, password} = req.body;
    try {
        const user = await User.findOne({email});
        if (!user) return res.status(400).json({message: "Invalid credentials"});     

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if(!isPasswordCorrect) return res.status(400).json({message: "Invalid credentials"});

        genrateToken(user._id, res);

        res.status(200).json({
            _id: user._id,
            fullName: user.fullName,
            email: user.email,
            isVerified: user.isVerified,
            profilePic: user.profilePic
        })
    } catch (error) {
        console.log('Error login controller', error.message);
        res.status(500).json({message: 'Internal Server Error'})
    }
};

export const logout = (req, res) => {
    try {
        res.cookie("jwt", "", {maxAge:0});
        res.status(200).json({message: "Logged out successfully!"})

    } catch (error) {
        console.log('Error logout controller', error.message);
        res.status(500).json({message: 'Internal Server Error'})
    }
};

export const updateProfile = async(req, res) => {
    try {
        const {profilePic} = req.body;

        const userId = req.user._id;
        if(!profilePic) return res.status(400).json({message: "Profile picture is required"});

        const uploadResponse = await cloudinary.uploader.upload(profilePic);
        const updatedUser = await User.findByIdAndUpdate(userId, {profilePic: uploadResponse.secure_url}, {new: true});
        res.status(200).json({updatedUser});

    } catch (error) {
        console.log('Error in update profile', error.message);
        res.status(500).json({message: 'Internal Server Error'})
    }
};

export const checkAuth = (req, res) => {
    try {
        res.status(200).json(req.user);
    } catch (error) {
        console.log('Error in checkAuth', error.message);
        res.status(500).json({message: 'Internal Server Error'})
    }
};

export const verifyOtp = async (req, res) => {
    const { email, otp } = req.body;
  
    try {
      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ message: 'User not found' });
  
      if (user.isVerified) return res.status(400).json({ message: 'User already verified' });
  
      const isOtpValid = await bcrypt.compare(otp, user.otp);
      const isExpired = user.otpExpires < Date.now();
  
      if (!isOtpValid || isExpired) {
        return res.status(400).json({ message: 'Invalid or expired OTP' });
      }
  
      user.isVerified = true;
      user.otp = undefined;
      user.otpExpires = undefined;
      await user.save();
  
      res.status(200).json({ message: 'Email verified. You can now log in.' });
    } catch (error) {
      console.log('Error verifying OTP', error.message);
      res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const resendOtp = async (req, res) => {
    try {
        const { email } = req.body;
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        if (user.isVerified) {
            return res.status(400).json({ message: "User already verified" });
        }
        const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedNewOtp = await bcrypt.hash(newOtp, 10);

        user.otp = hashedNewOtp;
        user.otpExpires = new Date(Date.now() + 1 * 60 * 1000); 
        await user.save();

        await sendEmail(email, newOtp);

        res.status(200).json({ message: "A new OTP has been sent to your email." });

    } catch (error) {
        console.error('Error in resendOtp:', error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const updateFullname = async(req, res) => {
    try {
        const {fullName} = req.body;
        const userId = req.user._id;

        if(!fullName) return res.status(400).json({message: "Full Name is required"});

        const updatedUser = await User.findByIdAndUpdate(userId, {fullName: fullName}, {new: true});
        res.status(200).json({updatedUser});

    } catch (error) {
        console.log('Error in update full name', error.message);
        res.status(500).json({message: 'Internal Server Error'})
    }
};
  