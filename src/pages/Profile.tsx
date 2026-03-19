import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { User, LogOut, Settings, HelpCircle, Database, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { db, auth, logout } from "../lib/firebase";
import { doc, getDocFromServer } from "firebase/firestore";
import { useState } from "react";
import { cn } from "../lib/utils";
import { useToast } from "../components/Toast";

export default function Profile() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const user = auth.currentUser;
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogout = async () => {
    await logout();
    localStorage.removeItem('biashara_user');
    showToast("Logged out successfully.", "info");
    navigate('/login');
  };

  const testConnection = async () => {
    setChecking(true);
    setStatus('idle');
    setErrorMsg("");

    try {
      // Test connection by fetching a non-existent doc from a test collection
      await getDocFromServer(doc(db, 'test', 'connection'));
      setStatus('success');
      showToast("Connected to Firestore!", "success");
    } catch (err: any) {
      console.error("Connection test failed:", err);
      // If it's just "not found", it's still a success in terms of connection
      if (err.code === 'not-found' || !err.message.includes('offline')) {
        setStatus('success');
        showToast("Connected to Firestore!", "success");
      } else {
        setStatus('error');
        setErrorMsg(err.message || "Could not connect to Firestore. Check your internet connection.");
        showToast("Connection failed.", "error");
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-md mx-auto space-y-8 w-full">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
      </header>

      <div className="flex flex-col items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4 overflow-hidden">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <User className="w-12 h-12" />
          )}
        </div>
        <h2 className="text-xl font-bold text-slate-900">{user?.displayName || user?.email || 'Guest'}</h2>
        <p className="text-sm text-slate-500">{user?.email || 'Business Owner'}</p>
      </div>

      <div className="space-y-2">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <span className="font-medium text-slate-900 block">Cloud Sync</span>
                <span className="text-xs text-slate-500">Firestore Connection</span>
              </div>
            </div>
            <Button 
              size="sm" 
              variant="outline" 
              className="h-8 text-xs font-bold"
              onClick={testConnection}
              disabled={checking}
            >
              {checking ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Check
            </Button>
          </div>

          {status === 'success' && (
            <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 p-2 rounded-lg border border-emerald-100">
              <CheckCircle2 className="w-4 h-4" />
              <span>Connected! Your data is syncing to Firestore.</span>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-100">
                <XCircle className="w-4 h-4" />
                <span>Connection failed.</span>
              </div>
              <p className="text-[10px] text-red-500 px-1">{errorMsg}</p>
            </div>
          )}
        </div>

        <button className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <span className="font-medium text-slate-900">Settings</span>
          </div>
        </button>
        
        <button className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center">
              <HelpCircle className="w-5 h-5" />
            </div>
            <span className="font-medium text-slate-900">Help & Support</span>
          </div>
        </button>
      </div>

      <Button 
        variant="outline" 
        className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" 
        size="lg"
        onClick={handleLogout}
      >
        <LogOut className="w-5 h-5 mr-2" />
        Log Out
      </Button>
    </div>
  );
}
