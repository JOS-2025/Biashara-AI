import { useState, useEffect, createContext, useContext } from 'react';
import { type User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Hydrate immediately from the cached session so the UI never flickers
    //    on page load — mirrors Firebase's synchronous initial emission from
    //    onAuthStateChanged.
    supabase.auth.getSession().then(({ data: { session } }) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        localStorage.setItem('biashara_user', sessionUser.id);
      } else {
        localStorage.removeItem('biashara_user');
      }
      setLoading(false);
    });

    // 2. Subscribe to all subsequent auth events (SIGNED_IN, SIGNED_OUT,
    //    TOKEN_REFRESHED, USER_UPDATED, etc.) — equivalent to Firebase's
    //    onAuthStateChanged listener.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        localStorage.setItem('biashara_user', sessionUser.id);
      } else {
        localStorage.removeItem('biashara_user');
      }
      // loading is already false after getSession resolves, but guard
      // here in case the auth event fires before getSession returns.
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
