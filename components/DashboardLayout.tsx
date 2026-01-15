'use client';

import React, { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, UserCheck, LayoutDashboard, Calendar, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface DashboardLayoutProps {
  children: ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const pathname = usePathname();
  const { accessLevel, email, logout } = useAuth();

  // Only show navigation items for admin users
  // MESA users should not see any navigation tabs
  const navItems = accessLevel === 'admin' ? [
    { href: './', label: 'Home', icon: LayoutDashboard },
    { href: 'mentor-dashboard', label: 'Mentor Dashboard', icon: UserCheck },
    { href: 'mentee-dashboard', label: 'Student Dashboard', icon: Users },
    { href: 'weekwise-sessions', label: 'All Session Details', icon: Calendar },
  ] : [];

  // Don't show navigation on login page
  const showNav = pathname !== '/login';

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#1A3636' }}>
      {showNav && (
        <nav className="shadow-md border-b" style={{ backgroundColor: '#1A3636', borderColor: '#2A4A4A' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                {accessLevel === 'admin' ? (
                  <Link href="./" className="flex-shrink-0 flex items-center hover:opacity-80 transition-opacity">
                    <span className="text-xl font-bold text-white">
                      Performance Dashboard
                    </span>
                  </Link>
                ) : (
                  <span className="text-xl font-bold text-white">
                    Performance Dashboard
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? 'text-white'
                          : 'text-gray-300 hover:text-white hover:bg-opacity-10'
                      }`}
                      style={isActive ? { backgroundColor: '#22C55E' } : {}}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {item.label}
                    </Link>
                  );
                })}
                {/* Logout Button */}
                <button
                  onClick={logout}
                  className="flex items-center px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-opacity-10 transition-all duration-200 ml-2"
                  title={`Logout (${email})`}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </nav>
      )}
      {pathname === '/login' ? (
        <>{children}</>
      ) : (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      )}
    </div>
  );
};

