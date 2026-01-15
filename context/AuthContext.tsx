'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export type AccessLevel = 'admin' | 'mesa' | null;

interface AuthContextType {
  isAuthenticated: boolean;
  accessLevel: AccessLevel;
  email: string | null;
  login: (email: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Check for existing session on mount
  useEffect(() => {
    const storedAuth = localStorage.getItem('auth');
    if (storedAuth) {
      try {
        const auth = JSON.parse(storedAuth);
        setIsAuthenticated(true);
        setAccessLevel(auth.accessLevel);
        setEmail(auth.email);
      } catch (e) {
        localStorage.removeItem('auth');
      }
    }
    setIsLoading(false);
  }, []);

  // Handle route protection
  useEffect(() => {
    if (isLoading) return;

    const storedAuth = localStorage.getItem('auth');
    const auth = storedAuth ? JSON.parse(storedAuth) : null;

    // If not authenticated and not on login page, redirect to login
    if (!auth && pathname !== '/login') {
      router.push('/login');
      return;
    }

    // If authenticated, handle access control
    if (auth) {
      const userAccessLevel = auth.accessLevel;

      // MESA users can only access student dashboard
      if (userAccessLevel === 'mesa') {
        if (pathname !== '/mentee-dashboard' && pathname !== '/login') {
          router.push('/mentee-dashboard');
        }
      }
      // Admin users can access everything except login (redirect to home)
      else if (userAccessLevel === 'admin' && pathname === '/login') {
        router.push('/');
      }
    }
  }, [isLoading, pathname, router]);

  const login = (email: string, password: string): boolean => {
    let userAccessLevel: AccessLevel = null;

    // Admin access: email ends with @gradnext.co, password is Gradnext@2026
    if (email.endsWith('@gradnext.co') && password === 'Gradnext@2026') {
      userAccessLevel = 'admin';
    }
    // MESA access: any other email, password is Student@2026
    else if (password === 'Student@2026') {
      userAccessLevel = 'mesa';
    }
    else {
      return false; // Invalid credentials
    }

    // Store auth in localStorage
    const authData = {
      email,
      accessLevel: userAccessLevel,
      timestamp: Date.now(),
    };
    localStorage.setItem('auth', JSON.stringify(authData));

    setIsAuthenticated(true);
    setAccessLevel(userAccessLevel);
    setEmail(email);

    // Redirect based on access level
    if (userAccessLevel === 'mesa') {
      router.push('/mentee-dashboard');
    } else {
      router.push('/');
    }

    return true;
  };

  const logout = () => {
    localStorage.removeItem('auth');
    setIsAuthenticated(false);
    setAccessLevel(null);
    setEmail(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, accessLevel, email, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
