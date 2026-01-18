'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Lock, Mail, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, isAuthenticated, accessLevel } = useAuth();
  const router = useRouter();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      if (accessLevel === 'mesa') {
        router.push('/student-dashboard');
      } else {
        router.push('/');
      }
    }
  }, [isAuthenticated, accessLevel, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!email || !password) {
      setError('Please enter both email and password');
      setIsLoading(false);
      return;
    }

    try {
      const success = await login(email.trim(), password);
      
      if (!success) {
        setError('Invalid email or password. Please try again.');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1A3636' }}>
      <div className="w-full max-w-md p-8">
        <div className="rounded-xl shadow-2xl border p-8" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">
              Performance Dashboard
            </h1>
            <p className="text-gray-300">
              Sign in to access your dashboard
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 rounded-lg flex items-center gap-3" style={{ backgroundColor: '#3A1A1A', borderColor: '#F87171' }}>
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full pl-10 pr-4 py-3 rounded-lg border focus:ring-2 focus:border-transparent transition-all"
                  style={{ 
                    backgroundColor: '#1A3636', 
                    borderColor: '#3A5A5A', 
                    color: '#fff' 
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#22C55E'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#3A5A5A'}
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-4 py-3 rounded-lg border focus:ring-2 focus:border-transparent transition-all"
                  style={{ 
                    backgroundColor: '#1A3636', 
                    borderColor: '#3A5A5A', 
                    color: '#fff' 
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#22C55E'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#3A5A5A'}
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
              style={{ backgroundColor: isLoading ? '#3A5A5A' : '#22C55E' }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.backgroundColor = '#16A34A';
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.backgroundColor = '#22C55E';
                }
              }}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-400">
              Mentor without a password?{' '}
              <a 
                href="set-password" 
                className="font-medium hover:underline transition-colors"
                style={{ color: '#22C55E' }}
              >
                Set up your account
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
