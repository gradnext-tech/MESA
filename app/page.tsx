'use client';

import React, { useState } from 'react';
import { GoogleSheetsAutoConnect } from '@/components/GoogleSheetsAutoConnect';
import { useData } from '@/context/DataContext';
import { parseSpreadsheetData } from '@/utils/metricsCalculator';
import { CheckCircle, TrendingUp, Users, UserCheck } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  const { sessions, setSessions, hasData } = useData();
  const [autoConnecting, setAutoConnecting] = useState(true);

  const handleDataLoaded = (data: any[]) => {
    const parsedSessions = parseSpreadsheetData(data);
    setSessions(parsedSessions);
    setAutoConnecting(false);
  };

  const handleAutoConnectError = () => {
    setAutoConnecting(false);
  };

  // Auto-connect on component mount
  React.useEffect(() => {
    const autoConnect = async () => {
      try {
        const response = await fetch('/api/sheets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });

        const result = await response.json();

        if (response.ok && result.success && result.data.sessions) {
          handleDataLoaded(result.data.sessions);
        } else {
          console.warn('Auto-connect failed:', result.error);
          setAutoConnecting(false);
        }
      } catch (error) {
        console.warn('Auto-connect error:', error);
        setAutoConnecting(false);
      }
    };

    autoConnect();
  }, []);

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
          MESA Dashboard
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Comprehensive analytics platform for mentorship sessions. Connect your Google Sheets to view detailed insights on mentors and mentees.
        </p>
      </div>

      {/* Auto-Connection Status */}
      {autoConnecting && (
        <div className="max-w-2xl mx-auto mb-8">
          <div className="bg-blue-50 rounded-xl p-6 border border-blue-200 text-center">
            <div className="flex items-center justify-center mb-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              Connecting to Google Sheets...
            </h3>
            <p className="text-blue-700">
              Automatically loading your mentorship data
            </p>
          </div>
        </div>
      )}

      {/* Manual Connection (only show if auto-connect failed and no data) */}
      {!autoConnecting && !hasData && (
        <div className="max-w-2xl mx-auto">
          <GoogleSheetsAutoConnect 
            onDataLoaded={handleDataLoaded} 
            onError={handleAutoConnectError}
          />
        </div>
      )}

      {/* Success State */}
      {hasData && (
        <div className="max-w-2xl mx-auto">
          <div className="mt-6 p-6 bg-blue-50 border border-blue-200 rounded-xl">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              Data Loaded Successfully
            </h3>
            <p className="text-blue-700 mb-4">
              {sessions.length} sessions available for analysis
            </p>
            <div className="flex gap-4">
              <Link
                href="/mentor-dashboard"
                className="flex-1 flex items-center justify-center px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg"
              >
                <UserCheck className="w-5 h-5 mr-2" />
                View Mentor Dashboard
              </Link>
              <Link
                href="/mentee-dashboard"
                className="flex-1 flex items-center justify-center px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all duration-200 shadow-md hover:shadow-lg"
              >
                <Users className="w-5 h-5 mr-2" />
                View Mentee Dashboard
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Features Grid */}
      <div className="grid md:grid-cols-2 gap-6 mt-12">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
            <UserCheck className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            Mentor Analytics
          </h3>
          <p className="text-gray-700">
            Track mentor performance with metrics like average ratings, sessions completed, 
            cancellations, and feedback statistics.
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
          <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">
            <Users className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            Mentee Insights
          </h3>
          <p className="text-gray-700">
            Analyze mentee engagement with session statistics, candidate behavior, 
            feedback scores, and performance percentiles.
          </p>
        </div>
      </div>

      {/* Instructions */}
      {!hasData && (
        <div className="max-w-2xl mx-auto mt-8 p-6 bg-gray-50 rounded-xl border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Getting Started
          </h3>
          <ol className="space-y-2 text-gray-700">
            <li className="flex items-start">
              <span className="font-semibold mr-2">1.</span>
              <span>Make sure your Google Sheet has a "Sessions" sheet with all required columns</span>
            </li>
            <li className="flex items-start">
              <span className="font-semibold mr-2">2.</span>
              <span>Add your Spreadsheet ID to the .env.local file as GOOGLE_SPREADSHEET_ID</span>
            </li>
            <li className="flex items-start">
              <span className="font-semibold mr-2">3.</span>
              <span>Share your Google Sheet with the service account email</span>
            </li>
            <li className="flex items-start">
              <span className="font-semibold mr-2">4.</span>
              <span>Click "Load Data" above to connect and fetch your data</span>
            </li>
            <li className="flex items-start">
              <span className="font-semibold mr-2">5.</span>
              <span>Navigate to Mentor or Mentee Dashboard to view analytics</span>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
