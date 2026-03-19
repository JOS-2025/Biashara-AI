import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Store, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toast";
import type { Session } from "@supabase/supabase-js";

export default function Login() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  /**
   * Real-time auth state listener.
   * Fires on initial load (INITIAL_SESSION) and on every subsequent
   * sign-in / sign-out event so the UI always reflects the true state.
   */
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await upsertUserProfile(session);

        if (event === "SIGNED_IN") {
          showToast("Welcome to Biashara Tracker!", "success");
          localStorage.setItem("biashara_user", session.user.id);
          navigate("/");
        }
      }
    });

    // Clean up the subscription when this component unmounts
    return () => subscription.unsubscribe();
  }, [navigate, showToast]);

  /**
   * Creates or updates a row in the public "users" table using
   * upsert so repeated logins are idempotent.
   */
  const upsertUserProfile = async (session: Session) => {
    const { user } = session;
    const meta = user.user_metadata;

    const { error: upsertError } = await supabase.from("users").upsert(
      {
        id: user.id,           // primary key — matches auth.users.id
        email: user.email,
        display_name: meta?.full_name ?? meta?.name ?? null,
        photo_url: meta?.avatar_url ?? meta?.picture ?? null,
        updated_at: new Date().toISOString(),
        // "role" is intentionally left out of the upsert payload so an
        // existing role value is never overwritten on subsequent logins.
        // Set a default value of 'user' at the database level instead.
      },
      {
        onConflict: "id",      // only update the columns we provide
        ignoreDuplicates: false,
      }
    );

    if (upsertError) {
      console.error("Failed to upsert user profile:", upsertError.message);
    }
  };

  /**
   * Triggers the Google OAuth flow.
   * Supabase redirects back to the app, at which point the
   * onAuthStateChange listener above handles the session.
   */
  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,   // where to land after OAuth
        queryParams: {
          access_type: "offline",   // request a refresh token from Google
          prompt: "consent",
        },
      },
    });

    if (oauthError) {
      setError("Google Sign-In failed. Please try again.");
      console.error(oauthError);
      setLoading(false); // only reset on error; redirect keeps loading spinner alive
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-200 mb-6">
            <Store className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Biashara Tracker
          </h1>
          <p className="text-slate-500 mt-2">
            Your smart business assistant. Track sales and expenses with ease.
          </p>
        </div>

        <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm border border-red-100 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-slate-800 mb-2">
                Welcome Back
              </h2>
              <p className="text-sm text-slate-500 mb-6">
                Please sign in to access your business data
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full h-14 rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all font-semibold flex items-center justify-center gap-3"
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
              ) : (
                <>
                  <img
                    src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                    className="w-5 h-5"
                    alt="Google"
                  />
                  Continue with Google
                </>
              )}
            </Button>
          </div>

          <div className="pt-4 text-center">
            <p className="text-xs text-slate-400">
              By continuing, you agree to our Terms of Service and Privacy
              Policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
