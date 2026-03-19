import { Outlet, NavLink } from "react-router";
import { Home, Package, MessageSquarePlus, User, Cloud, CloudOff } from "lucide-react";
import { cn } from "../lib/utils";
import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

export default function Layout() {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    // Simple way to monitor connection status in Firestore
    const unsubscribe = onSnapshot(doc(db, 'test', 'connection'), 
      () => setIsConnected(true),
      (err) => {
        if (err.code === 'unavailable' || err.message.includes('offline')) {
          setIsConnected(false);
        } else {
          setIsConnected(true);
        }
      }
    );
    return () => unsubscribe();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      <div className={cn(
        "h-1 w-full transition-colors duration-500",
        isConnected ? "bg-emerald-500" : "bg-red-500"
      )} />
      
      <main className="flex-1 flex flex-col min-h-0 pb-[76px]">
        <Outlet />
      </main>
      
      <nav className="fixed bottom-0 w-full bg-white border-t border-slate-200 px-6 py-3 flex justify-between items-center z-50 pb-4 h-[76px]">
        <NavLink 
          to="/" 
          className={({ isActive }) => cn(
            "flex flex-col items-center gap-1 text-xs font-medium transition-colors",
            isActive ? "text-emerald-600" : "text-slate-500 hover:text-slate-900"
          )}
        >
          <Home className="w-6 h-6" />
          <span>Dashboard</span>
        </NavLink>
        
        <NavLink 
          to="/products" 
          className={({ isActive }) => cn(
            "flex flex-col items-center gap-1 text-xs font-medium transition-colors",
            isActive ? "text-emerald-600" : "text-slate-500 hover:text-slate-900"
          )}
        >
          <Package className="w-6 h-6" />
          <span>Inventory</span>
        </NavLink>
        
        <NavLink 
          to="/chat" 
          className={({ isActive }) => cn(
            "flex flex-col items-center gap-1 text-xs font-medium transition-colors",
            isActive ? "text-emerald-600" : "text-slate-500 hover:text-slate-900"
          )}
        >
          <div className="bg-emerald-600 text-white p-3 rounded-full -mt-8 shadow-lg shadow-emerald-600/20">
            <MessageSquarePlus className="w-6 h-6" />
          </div>
          <span className="mt-1">Add</span>
        </NavLink>
        
        <NavLink 
          to="/profile" 
          className={({ isActive }) => cn(
            "flex flex-col items-center gap-1 text-xs font-medium transition-colors",
            isActive ? "text-emerald-600" : "text-slate-500 hover:text-slate-900"
          )}
        >
          <User className="w-6 h-6" />
          <span>Profile</span>
        </NavLink>
      </nav>
    </div>
  );
}
