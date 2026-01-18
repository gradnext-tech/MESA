'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getApiUrl } from '@/utils/api';

export type AccessLevel = 'admin' | 'mesa' | 'mentor' | null;

interface AuthContextType {
  isAuthenticated: boolean;
  accessLevel: AccessLevel;
  email: string | null;
  login: (email: string, password: string) => Promise<boolean>;
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

  // Check for existing session on mount and validate expiration
  useEffect(() => {
    const storedAuth = localStorage.getItem('auth');
    if (storedAuth) {
      try {
        const auth = JSON.parse(storedAuth);
        // Check if session has expired
        if (auth.expiresAt && Date.now() > auth.expiresAt) {
          localStorage.removeItem('auth');
          setIsLoading(false);
          return;
        }
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

    // Public pages that don't require authentication
    const publicPages = ['/login', '/set-password'];
    const isPublicPage = publicPages.includes(pathname);

    // If not authenticated and not on a public page, redirect to login
    if (!auth && !isPublicPage) {
      router.push('/login');
      return;
    }

    // If authenticated, handle access control
    if (auth) {
      const userAccessLevel = auth.accessLevel;

      // MESA users can only access student dashboard
      if (userAccessLevel === 'mesa') {
        if (pathname !== '/student-dashboard' && pathname !== '/login') {
          router.push('/student-dashboard');
        }
      }
      // Mentor users can only access mentor dashboard
      else if (userAccessLevel === 'mentor') {
        if (pathname !== '/mentor-dashboard' && pathname !== '/login') {
          router.push('/mentor-dashboard');
        }
      }
      // Admin users can access everything except login (redirect to home)
      else if (userAccessLevel === 'admin' && pathname === '/login') {
        router.push('/');
      }
    }
  }, [isLoading, pathname, router]);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      // Call backend API to verify credentials
      const response = await fetch(getApiUrl('api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        return false;
      }

      const { accessLevel: userAccessLevel, email: userEmail } = await response.json();

      // Store auth in localStorage with expiration (24 hours)
      const authData = {
        email: userEmail,
        accessLevel: userAccessLevel,
        timestamp: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      };
      localStorage.setItem('auth', JSON.stringify(authData));

      setIsAuthenticated(true);
      setAccessLevel(userAccessLevel);
      setEmail(userEmail);

      // Redirect based on access level
      if (userAccessLevel === 'mesa') {
        router.push('/student-dashboard');
      } else if (userAccessLevel === 'mentor') {
        router.push('/mentor-dashboard');
      } else {
        router.push('/');
      }

      return true;
    } catch (error) {
      return false;
    }
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
