import { Platform } from 'react-native';

// In development with Expo on Android:
// - Physical Android device over Wi-Fi connects to host computer's local Wi-Fi IP
// - Android Emulator maps localhost to 10.0.2.2
// - Production uses Railway cloud deployment: https://chatter-chatapp-production.up.railway.app
export const LOCAL_WIFI_IP = '192.168.8.194';

const DEV_URL = Platform.select({
  android: `http://${LOCAL_WIFI_IP}:5001`,
  default: 'http://localhost:5001',
});

export const PROD_URL = 'https://chatter-chatapp-production.up.railway.app';

// Set to true to connect mobile app directly to Railway production backend
export const USE_PROD_BACKEND = true;

export const BASE_URL = USE_PROD_BACKEND ? PROD_URL : (DEV_URL || PROD_URL);
export const API_URL = `${BASE_URL}/api`;
