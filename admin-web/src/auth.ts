import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';

const getAdminToken = async (user: User, forceRefresh = false) => {
  const token = await user.getIdTokenResult(forceRefresh);
  return { token, isAdmin: Boolean(token.claims.admin) };
};

export const loginAdmin = async (email: string, password: string) => {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const { isAdmin } = await getAdminToken(cred.user, true);

  if (!isAdmin) {
    throw new Error('This account is not an admin. Set custom claim admin=true first.');
  }

  return cred.user;
};

export const signupAdminCandidate = async (email: string, password: string) => {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await signOut(auth);
  return cred.user;
};

export const logoutAdmin = () => signOut(auth);

export const subscribeAuth = (onChange: (user: User | null, isAdmin: boolean) => void) =>
  onAuthStateChanged(auth, async (u) => {
    if (!u) {
      onChange(null, false);
      return;
    }

    try {
      const { isAdmin } = await getAdminToken(u);
      onChange(u, isAdmin);
    } catch {
      onChange(u, false);
    }
  });
