import React, { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Store, AlertCircle, Loader2 } from "lucide-react";
import { signInWithGoogle, db, handleFirestoreError, OperationType } from "../lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useToast } from "../components/Toast";

export default function Login() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const user = await signInWithGoogle();
      if (user) {
        // Create or update user profile in Firestore
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        
        const userData = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: userSnap.exists() ? userSnap.data().role : 'user',
          updatedAt: new Date().toISOString()
        };

        await setDoc(userRef, userData, { merge: true });

        showToast("Welcome to Biashara Tracker!", "success");
        localStorage.setItem("biashara_user", user.uid);
        navigate("/");
      }
    } catch (err: any) {
      if (err.message && err.message.includes('permission')) {
        handleFirestoreError(err, OperationType.WRITE, "users");
      } else {
        setError("Google Sign-In failed. Please try again.");
        console.error(err);
      }
    } finally {
      setLoading(false);
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
              <h2 className="text-xl font-semibold text-slate-800 mb-2">Welcome Back</h2>
              <p className="text-sm text-slate-500 mb-6">Please sign in to access your business data</p>
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
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                  Continue with Google
                </>
              )}
            </Button>
          </div>

          <div className="pt-4 text-center">
            <p className="text-xs text-slate-400">
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
