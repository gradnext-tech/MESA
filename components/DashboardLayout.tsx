'use client';

import React, { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, UserCheck, LayoutDashboard, Calendar } from 'lucide-react';

interface DashboardLayoutProps {
  children: ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Home', icon: LayoutDashboard },
    { href: '/mentor-dashboard', label: 'Mentor Dashboard', icon: UserCheck },
    { href: '/mentee-dashboard', label: 'Student Dashboard', icon: Users },
    { href: '/weekwise-sessions', label: 'All Session Details', icon: Calendar },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#1A3636' }}>
      <nav className="shadow-md border-b" style={{ backgroundColor: '#1A3636', borderColor: '#2A4A4A' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="flex-shrink-0 flex items-center hover:opacity-80 transition-opacity">
                <span className="text-xl font-bold text-white">
                  Performance Dashboard
                </span>
              </Link>
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
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};

