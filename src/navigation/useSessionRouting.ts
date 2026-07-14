import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { ensurePublicRoleProfile } from '../services/publicProfiles';
import { AppSessionState, UserProfile } from '../types/app';
import { isProfileComplete, isUserRole, isVerificationStatus, resolveDashboardRoute, resolveEffectiveRole } from './routeResolver';

const provisionDefaults = (user: { uid: string; email: string | null; displayName: string | null }, profile: UserProfile) => {
  const role = resolveEffectiveRole(profile);
  const rawRole = isUserRole(profile.role) ? profile.role : 'user';
  const requestedRole =
    profile.requestedRole ?? (rawRole !== 'user' && profile.verificationStatus !== 'approved' ? rawRole : null);

  return {
    uid: user.uid,
    email: profile.email ?? user.email ?? null,
    displayName: profile.displayName ?? user.displayName ?? null,
    role,
    setupComplete: true,

    locationCity: profile.locationCity ?? '',
    locationArea: profile.locationArea ?? '',

    requestedRole,
    verificationStatus: profile.verificationStatus ?? 'unsubmitted',
    verificationRejectReason: profile.verificationRejectReason ?? '',
    isProfileComplete: Boolean(profile.isProfileComplete ?? false),
    subscriptionStatus: profile.subscriptionStatus ?? 'inactive',
    subscriptionPaymentStatus: profile.subscriptionPaymentStatus ?? 'idle',
    subscriptionVerificationStatus: profile.subscriptionVerificationStatus ?? 'failed',
    subscriptionLastError: profile.subscriptionLastError ?? '',

    updatedAt: serverTimestamp(),
  };
};

export const useSessionRouting = (): AppSessionState => {
  const [session, setSession] = useState<AppSessionState>({ status: 'loading' });
  const profileUnsubscribeRef = useRef<(() => void) | null>(null);
  const provisioningRef = useRef<Record<string, boolean>>({});
  const ensuredPublicRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      profileUnsubscribeRef.current?.();
      profileUnsubscribeRef.current = null;

      if (!user) {
        setSession({ status: 'signedOut' });
        return;
      }

      const userRef = doc(db, 'users', user.uid);

      profileUnsubscribeRef.current = onSnapshot(
        userRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            // If a user exists in Auth but has no profile doc, treat it as not registered.
            void signOut(auth).catch(() => {
              // ignore
            });
            setSession({ status: 'signedOut' });
            return;
          }

          const profile = snapshot.data() as UserProfile;

          // Auto-provision required defaults for older docs.
          const needsProvision =
            !profile.setupComplete ||
            !isUserRole(profile.role) ||
            !isVerificationStatus(profile.verificationStatus) ||
            !profile.subscriptionStatus ||
            !profile.subscriptionPaymentStatus ||
            !profile.subscriptionVerificationStatus ||
            resolveEffectiveRole(profile) !== (isUserRole(profile.role) ? profile.role : 'user');
          if (needsProvision && !provisioningRef.current[user.uid]) {
            provisioningRef.current[user.uid] = true;
            const payload = provisionDefaults(
              { uid: user.uid, email: user.email ?? null, displayName: user.displayName ?? null },
              profile,
            );

            // Preserve createdAt if already present, otherwise set on first provision.
            if (!profile.createdAt) {
              (payload as any).createdAt = serverTimestamp();
            }

            void setDoc(userRef, payload, { merge: true }).finally(() => {
              delete provisioningRef.current[user.uid];
            });
          }

          if (!isProfileComplete(profile)) {
            // Never hold the app on splash forever. Older/incomplete docs can still use
            // the user dashboard while the background provision write catches up.
            const fallbackProfile = {
              ...profile,
              uid: user.uid,
              email: profile.email ?? user.email ?? null,
              displayName: profile.displayName ?? user.displayName ?? null,
              role: isUserRole(profile.role) ? profile.role : 'user',
              setupComplete: true,
              verificationStatus: isVerificationStatus(profile.verificationStatus) ? profile.verificationStatus : 'unsubmitted',
              subscriptionStatus: profile.subscriptionStatus ?? 'inactive',
              subscriptionPaymentStatus: profile.subscriptionPaymentStatus ?? 'idle',
              subscriptionVerificationStatus: profile.subscriptionVerificationStatus ?? 'failed',
            } as UserProfile & { role: any; setupComplete: true };

            setSession({
              status: 'ready',
              user,
              profile: fallbackProfile,
              route: resolveDashboardRoute(resolveEffectiveRole(fallbackProfile)),
            });
            return;
          }

          // After admin approval (role switch), create the public artist/dealer profile doc.
          // Sensitive verification fields remain only in verifications/{uid}.
          const ensureKey = `${user.uid}:${profile.role}:${profile.verificationStatus}`;
          if (!ensuredPublicRef.current[ensureKey]) {
            ensuredPublicRef.current[ensureKey] = true;
            void ensurePublicRoleProfile(profile as any).catch(() => {
              // ignore
            });
          }
          
          setSession({
            status: 'ready',
            user,
            profile: profile as UserProfile & { role: any; setupComplete: true },
            route: resolveDashboardRoute(isUserRole(profile.role) ? profile.role : 'user'),
          });
        },
        (error) => {
          console.error('TATZO: profile subscription failed', error);
          setSession({ status: 'signedOut' });
        },
      );
    });

    return () => {
      unsubscribeAuth();
      profileUnsubscribeRef.current?.();
    };
  }, []);

  return session;
};





