import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
     apiKey: "AIzaSyBDDnDj-eX1tNpMVqQMrol7nD21lbUJQYM",
     authDomain: "next-crud-27580.firebaseapp.com",
     projectId: "next-crud-27580",
     storageBucket: "next-crud-27580.firebasestorage.app",
     messagingSenderId: "68386094652",
     appId: "1:68386094652:web:de020409ba06b934874d39"
   };
   
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
