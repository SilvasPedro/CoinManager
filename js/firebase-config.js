import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyC_4uHxa8NsmExmbZ602r8IsUZg6yvbO7o",
  authDomain: "coinmanager-7e0bd.firebaseapp.com",
  projectId: "coinmanager-7e0bd",
  storageBucket: "coinmanager-7e0bd.firebasestorage.app",
  messagingSenderId: "812321893222",
  appId: "1:812321893222:web:b75756885a781ca09e36a7"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();