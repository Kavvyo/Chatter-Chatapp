import express from 'express';
import dotenv from 'dotenv';
import cookieparser from 'cookie-parser';
import cors from 'cors';

import path from 'path';

import { connectDB } from './lib/db.js';
import authRoutes from './routes/auth.route.js';
import messageRoutes from './routes/message.route.js';
import friendsRoute from './routes/friends.route.js';
import { app, server } from './lib/socket.js';

console.log({ authRoutes, messageRoutes, friendsRoute });


dotenv.config();
const PORT = process.env.PORT;

const __dirname = path.resolve();

app.use(express.json({ limit: '10mb' }));
app.use(cookieparser());
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}));

app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/friends', friendsRoute);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("/*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });
}

console.log("---- Registered Routes ----");

if (app && app._router && app._router.stack) {
  app._router.stack
    .filter(layer => layer.route)
    .forEach(layer => {
      const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
      console.log(`[ROUTE] ${methods} ${layer.route.path}`);
    });
} else {
  console.warn("No routes registered or app._router is undefined.");
}

console.log("---------------------------");





try {
  server.listen(PORT, () =>{
    console.log('Server running on port:' + PORT);
    connectDB();
})

} catch (error) {
  console.error("Failed to start server:", error);
}