import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';

export const loginAdmin = async (email: string, password: string) => {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const token = await cred.user.getIdTokenResult(true);

  if (!token.claims.admin) {
    await signOut(auth);
    throw new Error('This account is not an admin. Set custom claim admin=true first.');
  }

  return cred.user;
};

export const logoutAdmin = () => signOut(auth);

export const subscribeAuth = (onChange: (user: User | null, isAdmin: boolean) => void) =>
  onAuthStateChanged(auth, async (u) => {
    if (!u) {
      onChange(null, false);
      return;
    }

    const token = await u.getIdTokenResult();
    onChange(u, Boolean(token.claims.admin));
  });
