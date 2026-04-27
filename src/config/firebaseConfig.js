import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  initializeAuth,
  getReactNativePersistence,
  setPersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyBLkCA9N4M1KkHLIfKszoOEwTJ4aX0nkKk',
  authDomain: 'tatzo-as0711.firebaseapp.com',
  projectId: 'tatzo-as0711',
  storageBucket: 'tatzo-as0711.firebasestorage.app',
  messagingSenderId: '291673704185',
  appId: '1:291673704185:web:a50ac0fbc4d01dc2130428',
};

const hasExistingApp = getApps().length > 0;
const app = hasExistingApp ? getApp() : initializeApp(firebaseConfig);

const createAuth = () => {
  if (Platform.OS === 'web') {
    const webAuth = getAuth(app);
    setPersistence(webAuth, browserLocalPersistence).catch(() => {
      // Persistence is a best-effort enhancement on web.
    });
    return webAuth;
  }

  return hasExistingApp
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
};

export const auth = createAuth();
export const db = getFirestore(app);
export const storage = getStorage(app);
