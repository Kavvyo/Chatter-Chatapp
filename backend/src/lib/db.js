import mongoose from 'mongoose';
import dns from 'node:dns';

// Fix for Windows / ISP DNS resolvers that refuse SRV queries on mongodb+srv://
try {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
    // ignore
}

export const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        console.log(`MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        console.log(`MongoDB Connection Error: ${error}`);
    }
};
