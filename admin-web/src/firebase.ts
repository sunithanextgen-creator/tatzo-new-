import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyBLkCA9N4M1KkHLIfKszoOEwTJ4aX0nkKk',
  authDomain: 'tatzo-as0711.firebaseapp.com',
  projectId: 'tatzo-as0711',
  storageBucket: 'tatzo-as0711.firebasestorage.app',
  messagingSenderId: '291673704185',
  appId: '1:291673704185:web:a50ac0fbc4d01dc2130428',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
