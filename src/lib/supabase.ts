import { createClient, type SupabaseClient, type AuthError, type PostgrestError } from '@supabase/supabase-js';

// ─── Client initialisation ────────────────────────────────────────────────────
//
// Vite  → import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// CRA   → process.env.REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY
//
// Add both pairs to your .env so the file works in either setup.

const supabaseUrl: string =
  (import.meta as any)?.env?.VITE_SUPABASE_URL ??
  (typeof process !== 'undefined' ? process.env.REACT_APP_SUPABASE_URL : '') ??
  '';

const supabaseAnonKey: string =
  (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY ??
  (typeof process !== 'undefined' ? process.env.REACT_APP_SUPABASE_ANON_KEY : '') ??
  '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase] Missing environment variables.\n' +
    'Vite  → VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY\n' +
    'CRA   → REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY'
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the session in localStorage so the user stays logged in
    // across page refreshes without a round-trip to Supabase Auth.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,   // required for OAuth redirect flows (Google, etc.)
  },
});

// ─── OperationType enum ───────────────────────────────────────────────────────
//
// Mirrors the Firebase OperationType enum used across the codebase so
// existing call-sites need no changes beyond swapping the import path.

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST   = 'list',
  GET    = 'get',
  WRITE  = 'write',
}

// ─── Error helpers ────────────────────────────────────────────────────────────

interface SupabaseErrorInfo {
  error:         string;
  code?:         string;
  operationType: OperationType;
  path:          string | null;
  authInfo: {
    userId:    string | undefined;
    email:     string | undefined;
    provider:  string | undefined;
  };
}

/**
 * Structured error logger — mirrors `handleFirestoreError` in firebase.ts.
 *
 * Captures the current auth context alongside the error details, logs a
 * JSON-serialised summary to the console, and re-throws so callers can
 * treat it as a fatal error if needed.
 *
 * @param error         The raw error from a Supabase call.
 * @param operationType The type of DB operation being attempted.
 * @param path          The table name or resource path (e.g. "transactions").
 */
export async function handleSupabaseError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): Promise<never> {
  // Pull the current user from the active session (non-blocking)
  const { data: { user } } = await supabase.auth.getUser();

  const pgError   = error as PostgrestError | null;
  const authError = error as AuthError       | null;

  const errorMessage =
    pgError?.message    ??
    authError?.message  ??
    (error instanceof Error ? error.message : String(error));

  const errorCode =
    pgError?.code       ??
    authError?.status?.toString();

  const errInfo: SupabaseErrorInfo = {
    error:         errorMessage,
    code:          errorCode,
    operationType,
    path,
    authInfo: {
      userId:   user?.id,
      email:    user?.email ?? undefined,
      provider: user?.app_metadata?.provider,
    },
  };

  console.error('[Supabase] Error:', JSON.stringify(errInfo, null, 2));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Lightweight permission check helper.
 * Returns true when the error looks like a Postgres RLS / permission denial
 * so callers can show appropriate UI feedback without parsing strings.
 */
export function isPermissionError(error: unknown): boolean {
  if (!error) return false;
  const msg  = (error as any)?.message ?? String(error);
  const code = (error as any)?.code    ?? '';
  return (
    code === '42501' ||                      // Postgres insufficient_privilege
    msg.toLowerCase().includes('permission') ||
    msg.toLowerCase().includes('denied')    ||
    msg.toLowerCase().includes('rls')
  );
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/**
 * Trigger a Google OAuth popup/redirect flow.
 * After sign-in, Supabase redirects back to `window.location.origin`.
 * The `onAuthStateChange` listener in your components handles the resulting
 * session exactly as Firebase's `onAuthStateChanged` did.
 */
export const signInWithGoogle = async (): Promise<void> => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo:  `${window.location.origin}/`,
      queryParams: {
        access_type: 'offline',  // request a refresh token from Google
        prompt:      'consent',
      },
    },
  });

  if (error) {
    console.error('[Supabase] Google sign-in error:', error.message);
    throw error;
  }
};

/**
 * Sign the current user out and clear the local session.
 */
export const logout = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('[Supabase] Sign-out error:', error.message);
    throw error;
  }
};

// ─── Real-time auth state listener ───────────────────────────────────────────
//
// Mirrors Firebase's `onAuthStateChanged`. Call `subscribeToAuthState` once
// at app root level (or inside a context provider) and call the returned
// unsubscribe function on unmount.
//
// Usage:
//   const unsubscribe = subscribeToAuthState((user) => {
//     if (user) setCurrentUser(user);
//     else setCurrentUser(null);
//   });
//   return () => unsubscribe();

import type { User } from '@supabase/supabase-js';

export type AuthStateCallback = (user: User | null) => void;

export const subscribeToAuthState = (callback: AuthStateCallback): (() => void) => {
  // Fire immediately with the current session so the UI is never stale
  supabase.auth.getSession().then(({ data: { session } }) => {
    callback(session?.user ?? null);
  });

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });

  return () => subscription.unsubscribe();
};

// ─── Connection probe ─────────────────────────────────────────────────────────
//
// Mirrors Firebase's `testConnection()`. Runs a lightweight query against a
// known table to confirm the client can reach Supabase. Logs a clear message
// when offline or misconfigured.

async function testConnection(): Promise<void> {
  try {
    // A HEAD-style query — fetches zero rows but still validates auth + network
    const { error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    if (error) {
      if (
        error.message.toLowerCase().includes('fetch') ||
        error.message.toLowerCase().includes('network') ||
        error.message.toLowerCase().includes('offline')
      ) {
        console.error('[Supabase] Network error — please check your connection.');
      } else if (isPermissionError(error)) {
        // RLS blocked the probe — that's fine, it means the client IS connected
        // (anonymous users can't read `users`; that's expected).
      } else {
        console.warn('[Supabase] Connection probe warning:', error.message);
      }
    }
  } catch (err) {
    console.error('[Supabase] Could not reach Supabase. Check SUPABASE_URL and SUPABASE_ANON_KEY.', err);
  }
}

testConnection();
