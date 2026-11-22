import express from 'express';
import dotenv from 'dotenv';
import cookieparser from 'cookie-parser';
import cors from 'cors';

import path from 'path';

import { connectDB } from './lib/db.js';
import authRoutes from './routes/auth.route.js';
import messageRoutes from './routes/message.route.js';
import friendsRoute from './routes/friends.route.js';
import livekitRoutes from './routes/livekit.route.js';
import { app, server } from './lib/socket.js';


dotenv.config();
const PORT = process.env.PORT;

const __dirname = path.resolve();

app.use(express.json({ limit: '10mb' }));
app.use(cookieparser());
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:5001",
  "https://chatter-chatapp-production.up.railway.app",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // allow non-browser requests (mobile native, curl, postman)
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('http://192.168.') ||
      origin.includes('railway.app')
    ) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed: ' + origin), false);
  },
  credentials: true,
}));

app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/friends', friendsRoute);
app.use('/api/livekit', livekitRoutes);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("*path", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });
}


try {
  server.listen(PORT, () =>{
    console.log('Server running on port:' + PORT);
    connectDB();
})

} catch (error) {
  console.error("Failed to start server:", error);
}