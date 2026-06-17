import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { auth } from "./api";

interface User {
  id: number;
  username: string;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  authChecking: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  setUser: () => {},
  authChecking: true,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    auth
      .me()
      .then((u) => {
        if (u) setUser(u);
        setAuthChecking(false);
      })
      .catch(() => setAuthChecking(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, authChecking }}>
      {children}
    </AuthContext.Provider>
  );
}
