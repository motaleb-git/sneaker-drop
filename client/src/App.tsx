import { useEffect, useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { onUnauthorized } from "./lib/api";
import { clearSession, getUser, type AuthUser } from "./lib/auth";
import { useDropsStore } from "./store/dropsStore";

export function App() {
  const [user, setUser] = useState<AuthUser | null>(() => getUser());

  useEffect(() => {
    onUnauthorized(() => {
      useDropsStore.getState().reset();
      clearSession();
      setUser(null);
    });
  }, []);

  if (!user) {
    return (
      <Login
        onAuthed={(next) => {
          useDropsStore.getState().reset();
          setUser(next);
        }}
      />
    );
  }

  return <Dashboard user={user} onLogout={() => setUser(null)} />;
}
