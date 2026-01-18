'use client';

import React, { useState } from 'react';
import { GoogleSheetsAutoConnect } from '@/components/GoogleSheetsAutoConnect';
import { useData } from '@/context/DataContext';
import { parseSpreadsheetData, parseStudentData } from '@/utils/metricsCalculator';
import { getApiUrl } from '@/utils/api';
import { CheckCircle, TrendingUp, Users, UserCheck } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  const { sessions, setSessions, hasData, students, setStudents, setCandidateFeedbacks, setMentorFeedbacks } = useData();
  const [autoConnecting, setAutoConnecting] = useState(true);
  const hasLoadedRef = React.useRef(false);

  const handleDataLoaded = (data: { 
    sessions: any[]; 
    mentorFeedbacks?: any[]; 
    candidateFeedbacks?: any[];
    students?: any[];
  }) => {
    const parsedSessions = parseSpreadsheetData(
      data.sessions, 
      data.mentorFeedbacks, 
      data.candidateFeedbacks
    );
    const parsedStudents = parseStudentData(data.students || []);
    setSessions(parsedSessions);
    setStudents(parsedStudents);
    setCandidateFeedbacks(data.candidateFeedbacks || []);
    setMentorFeedbacks(data.mentorFeedbacks || []);
    setAutoConnecting(false);
  };

  const handleAutoConnectError = () => {
    setAutoConnecting(false);
  };

  // Auto-connect on component mount ONLY if data is not already loaded
  React.useEffect(() => {
    // If we've already attempted to load, don't reload
    if (hasLoadedRef.current) {
      return;
    }

    // If data is already loaded, don't reload
    if (hasData && sessions.length > 0) {
      setAutoConnecting(false);
      hasLoadedRef.current = true;
      return;
    }

    // Mark that we're attempting to load
    hasLoadedRef.current = true;

    const autoConnect = async () => {
      try {
        const apiUrl = getApiUrl('api/sheets');
        console.log('Fetching API from:', apiUrl, 'Current pathname:', typeof window !== 'undefined' ? window.location.pathname : 'N/A');
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          const text = await response.text();
          console.error('API Error Response:', text);
          throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();

        if (response.ok && result.success && result.data.sessions) {
          handleDataLoaded({
            sessions: result.data.sessions,
            mentorFeedbacks: result.data.mentorFeedbacks || [],
            candidateFeedbacks: result.data.candidateFeedbacks || [],
            students: result.data.students || result.data.mentees || [],
          });
        } else {
          setAutoConnecting(false);
        }
      } catch (error) {
        console.error('Error in autoConnect:', error);
        setAutoConnecting(false);
      }
    };

    autoConnect();
  }, [hasData, sessions.length, setSessions, setStudents]); // Include all dependencies

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl md:text-5xl font-bold text-white">
          Performance Dashboard
        </h1>
        <p className="text-lg text-gray-300 max-w-2xl mx-auto">
          Comprehensive analytics platform for mentorship sessions. Connect your Google Sheets to view detailed insights on mentors and students.
        </p>
      </div>

      {/* Auto-Connection Status */}
      {autoConnecting && (
        <div className="max-w-2xl mx-auto mb-8">
          <div className="rounded-xl p-6 border text-center" style={{ backgroundColor: '#2A4A4A', borderColor: '#22C55E' }}>
            <div className="flex items-center justify-center mb-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#22C55E' }}></div>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              Connecting to Google Sheets...
            </h3>
            <p className="text-gray-300">
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

      {/* Success State - Show links even if parsed data is empty, as long as API call succeeded */}
      {!autoConnecting && (
        <div className="max-w-2xl mx-auto">
          <div className="mt-6 p-6 border rounded-xl" style={{ backgroundColor: '#2A4A4A', borderColor: hasData ? '#22C55E' : '#F59E0B' }}>
            <h3 className="text-lg font-semibold text-white mb-2">
              {hasData ? 'Data Loaded Successfully' : 'Connection Successful - No Valid Data Found'}
            </h3>
            <p className="text-gray-300 mb-4">
              {hasData 
                ? `${sessions.length} sessions available for analysis`
                : 'Google Sheets connected successfully, but no valid session data was found. Please check that your sheet has data with Date, Mentor Email, and Student Email fields filled in.'}
            </p>
            <div className="flex gap-4">
              <Link
                href="/mentor-dashboard"
                className="flex-1 flex items-center justify-center px-4 py-3 text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
                style={{ backgroundColor: '#22C55E' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#16A34A'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#22C55E'}
              >
                <UserCheck className="w-5 h-5 mr-2" />
                View Mentor Dashboard
              </Link>
              <Link
                href="/student-dashboard"
                className="flex-1 flex items-center justify-center px-4 py-3 text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
                style={{ backgroundColor: '#CAE8A0', color: '#1A3636' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#B8D88A'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#CAE8A0'}
              >
                <Users className="w-5 h-5 mr-2" />
                View Student Dashboard
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Features Grid */}
      <div className="grid md:grid-cols-2 gap-6 mt-12">
        <div className="rounded-xl p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ backgroundColor: '#22C55E' }}>
            <UserCheck className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            Mentor Analytics
          </h3>
          <p className="text-gray-300">
            Track mentor performance with metrics like average ratings, sessions completed, 
            cancellations, and feedback statistics.
          </p>
        </div>

        <div className="rounded-xl p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={{ backgroundColor: '#22C55E' }}>
            <Users className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            Student Insights
          </h3>
          <p className="text-gray-300">
            Analyze student engagement with session statistics, candidate behavior, 
            feedback scores, and performance percentiles.
          </p>
        </div>
      </div>

      {/* Instructions */}
      {!hasData && (
        <div className="max-w-2xl mx-auto mt-8 p-6 rounded-xl border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <h3 className="text-lg font-semibold text-white mb-3">
            Getting Started
          </h3>
          <ol className="space-y-2 text-gray-300">
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
              <span>Navigate to Mentor or Student Dashboard to view analytics</span>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
