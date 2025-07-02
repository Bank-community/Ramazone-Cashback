// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDD_D0IVWm1Q6ySwqSh8GCyD2PE1L6Pw_k",
  authDomain: "bank-home-picture.firebaseapp.com",
  databaseURL: "https://bank-home-picture-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bank-home-picture",
  storageBucket: "bank-home-picture.firebasestorage.app",
  messagingSenderId: "163431983802",
  appId: "1:163431983802:web:9ea1de11c1c68457993083"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

export { auth, db };