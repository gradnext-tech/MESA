'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { getApiUrl } from '@/utils/api';

export default function SetPasswordPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(getApiUrl('api/auth/set-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, confirmPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to set password');
        setIsLoading(false);
        return;
      }

      setSuccess('Password set successfully! Redirecting to login...');
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (error) {
      setError('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1A3636' }}>
      <div className="w-full max-w-md p-8">
        <div className="rounded-xl shadow-2xl border p-8" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: '#22C55E' }}>
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Set Your Password
            </h1>
            <p className="text-gray-300">
              Create a secure password for your mentor account
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 rounded-lg flex items-center gap-3" style={{ backgroundColor: '#3A1A1A', borderColor: '#F87171' }}>
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-6 p-4 rounded-lg flex items-center gap-3" style={{ backgroundColor: '#1A3A1A', borderColor: '#22C55E' }}>
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              <p className="text-green-400 text-sm">{success}</p>
            </div>
          )}

          {/* Setup Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Mentor Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email from mentor directory"
                  className="w-full pl-10 pr-4 py-3 rounded-lg border focus:ring-2 focus:border-transparent transition-all"
                  style={{ 
                    backgroundColor: '#1A3636', 
                    borderColor: '#3A5A5A', 
                    color: '#fff' 
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#22C55E'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#3A5A5A'}
                  disabled={isLoading || !!success}
                  required
                />
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Use the email address registered in the Mentor Directory
              </p>
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
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full pl-10 pr-12 py-3 rounded-lg border focus:ring-2 focus:border-transparent transition-all"
                  style={{ 
                    backgroundColor: '#1A3636', 
                    borderColor: '#3A5A5A', 
                    color: '#fff' 
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#22C55E'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#3A5A5A'}
                  disabled={isLoading || !!success}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                  disabled={isLoading || !!success}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Minimum 8 characters
              </p>
            </div>

            {/* Confirm Password Input */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full pl-10 pr-12 py-3 rounded-lg border focus:ring-2 focus:border-transparent transition-all"
                  style={{ 
                    backgroundColor: '#1A3636', 
                    borderColor: '#3A5A5A', 
                    color: '#fff' 
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#22C55E'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#3A5A5A'}
                  disabled={isLoading || !!success}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                  disabled={isLoading || !!success}
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !!success}
              className="w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
              style={{ backgroundColor: (isLoading || success) ? '#3A5A5A' : '#22C55E' }}
              onMouseEnter={(e) => {
                if (!isLoading && !success) {
                  e.currentTarget.style.backgroundColor = '#16A34A';
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading && !success) {
                  e.currentTarget.style.backgroundColor = '#22C55E';
                }
              }}
            >
              {isLoading ? 'Setting Password...' : success ? 'Success!' : 'Set Password'}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-400">
              Already have a password?{' '}
              <a 
                href="login" 
                className="font-medium hover:underline transition-colors"
                style={{ color: '#22C55E' }}
              >
                Sign In
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
