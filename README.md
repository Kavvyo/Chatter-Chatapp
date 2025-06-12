
# Chatter 💬

**Chatter** is a full-stack real-time chat application built with the **MERN stack**, **Socket.IO**, and **DaisyUI**. It supports private messaging, friend requests, and a sleek responsive UI.

---

## 🚀 Features

- ✅ Realtime private messaging
- ✅ OTP-based authentication
- ✅ Friend request system
- ✅ Online/offline user status
- ✅ Theme toggle (dark/light)
- ✅ Mobile responsive layout (DaisyUI)
- ✅ Cloudinary image uploads
- 🔜 Voice & Video Call Support using WebRTC (WIP)

---

## 🛠️ Tech Stack

| Layer      | Stack                                |
|------------|---------------------------------------|
| Frontend   | React, Vite, Zustand, DaisyUI, TailwindCSS |
| Backend    | Node.js, Express.js, MongoDB, Socket.IO |
| Media      | Cloudinary (image uploads)            |
| Email      | NodeMailer (OTP verification)         |
| Calls (TODO) | WebRTC (Voice/Video calls)             |

---

## 📁 Project Structure

```
Chatter/
├── backend/
│   ├── controllers/
│   ├── lib/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   └── seeds/
├── frontend/
│   ├── assets/
│   ├── components/
│   ├── constants/
│   ├── lib/
│   ├── pages/
│   ├── store/
│   └── main.jsx
```

---

## 📦 Installation

### 1. Clone the repository
```bash
git clone https://github.com/your-username/chatter.git
cd chatter
```

### 2. Backend Setup
```bash
cd backend
npm install
cp .env.example .env  # then edit with your config
npm run dev
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

---

## 🔐 Environment Variables

Rename `.env.example` → `.env` and fill with your actual credentials:

```env
# Server
PORT=5000
NODE_ENV=development

# MongoDB
MONGODB_LOCAL=mongodb://localhost:27017/chatter
MONGODB_URI=your_production_uri

# Auth
JWT_SECRET=your_secret

# Cloudinary
CLOUDINARY_CLOUDNAME=your_cloud_name
CLOUDINARY_APIKEY=your_api_key
CLOUDINARY_SECRET=your_api_secret

# Email (OTP)
EMAIL_USER=your_email@example.com
EMAIL_PASS=your_email_password
```

---

## 📞 WebRTC Features (TODO)

The app will soon support:

- 🎥 Video Calls
- 🎙️ Voice Calls
- 📲 Call Notifications
- 🔴 Online Call Status

> Implementation will use **WebRTC** + **Socket.IO** for signaling.

---

## 📈 Future Improvements

- Group chats
- Message reactions
- Media sharing
- Call logs & history
- Push notifications

---

## 📄 License

MIT © 2025 [Your Name]

---

## 🙌 Acknowledgements

- [Socket.IO](https://socket.io/)
- [Cloudinary](https://cloudinary.com/)
- [DaisyUI](https://daisyui.com/)
- [Zustand](https://github.com/pmndrs/zustand)
