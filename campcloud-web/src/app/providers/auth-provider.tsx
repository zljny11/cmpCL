import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Spin } from 'antd';
import { authApi } from '../../services/api/auth';
import { queryClient } from '../../services/query-client';
import { clearToken, getToken, setToken } from '../../services/http';
import { AuthUser, LoginPayload } from '../../types/auth';

interface AuthContextValue {
  isReady: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  const refreshMe = async () => {
    const me = await authApi.getMe();
    setUser(me);
  };

  useEffect(() => {
    const bootstrap = async () => {
      const token = getToken();
      if (!token) {
        setIsReady(true);
        return;
      }

      try {
        await refreshMe();
      } catch {
        clearToken();
        setUser(null);
      } finally {
        setIsReady(true);
      }
    };

    void bootstrap();
  }, []);

  const login = async (payload: LoginPayload) => {
    queryClient.clear();
    const result = await authApi.login(payload);
    setToken(result.token);
    const me = await authApi.getMe();
    setUser(me);
  };

  const logout = () => {
    queryClient.clear();
    clearToken();
    setUser(null);
  };

  if (!isReady) {
    return (
      <div className="full-screen-centered">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        isReady,
        isAuthenticated: Boolean(user),
        user,
        login,
        logout,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
