// Firebase configuration for project: dating-app-40a80
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCLT7juJW__fGxI5RiYpBHmclZz4Reaysw",
  authDomain: "dating-app-40a80.firebaseapp.com",
  projectId: "dating-app-40a80",
  storageBucket: "dating-app-40a80.firebasestorage.app",
  messagingSenderId: "611483177195",
  appId: "1:611483177195:web:319f32d47f3daec6caaeae",
  measurementId: "G-5NWRN0QPCQ"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
