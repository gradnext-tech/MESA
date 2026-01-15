'use client';

import React, { useState } from 'react';
import { FileSpreadsheet, Loader2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface GoogleSheetsAutoConnectProps {
  onDataLoaded: (data: { 
    sessions: any[]; 
    mentorFeedbacks?: any[]; 
    candidateFeedbacks?: any[];
    mentees?: any[];
  }) => void;
  onError?: () => void;
}

export const GoogleSheetsAutoConnect: React.FC<GoogleSheetsAutoConnectProps> = ({
  onDataLoaded,
  onError,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/sheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}), // No spreadsheet ID needed - comes from env
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch data');
      }

      if (result.success && result.data.sessions) {
        onDataLoaded({
          sessions: result.data.sessions,
          mentorFeedbacks: result.data.mentorFeedbacks || [],
          candidateFeedbacks: result.data.candidateFeedbacks || [],
          mentees: result.data.mentees || [],
        });
        setSuccess(true);
        setSpreadsheetId(result.sessionsSpreadsheetId || result.spreadsheetId);
      } else {
        throw new Error('No session data found in the spreadsheet');
      }
    } catch (err: any) {
      console.error('Error connecting to Google Sheets:', err);
      setError(err.message || 'Failed to connect to Google Sheets');
      onError?.();
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    handleConnect();
  };

  return (
    <div className="w-full space-y-4">
      <div className="rounded-xl shadow-md p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
        <div className="flex items-center mb-4">
          <FileSpreadsheet className="w-6 h-6 mr-2" style={{ color: '#22C55E' }} />
          <h3 className="text-lg font-semibold text-white">
            Connect to Google Sheets
          </h3>
        </div>

        <div className="space-y-4">
          <div className="text-center">
            <p className="text-gray-300 mb-4">
              Your spreadsheet is configured via environment variables.
              {spreadsheetId && (
                <span className="block text-sm text-gray-400 mt-1">
                  Connected to: {spreadsheetId.substring(0, 20)}...
                </span>
              )}
            </p>
            
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleConnect}
                disabled={loading}
                className="px-6 py-3 text-white rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                style={{ backgroundColor: loading ? '#6B7280' : '#22C55E' }}
                onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#16A34A')}
                onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#22C55E')}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-5 h-5" />
                    Load Data
                  </>
                )}
              </button>

              {success && (
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="px-6 py-3 text-white rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  style={{ backgroundColor: loading ? '#6B7280' : '#CAE8A0', color: loading ? '#fff' : '#1A3636' }}
                  onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#B8D88A')}
                  onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#CAE8A0')}
                >
                  <RefreshCw className="w-5 h-5" />
                  Refresh
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-700 font-medium">Connection Error</p>
                <p className="text-red-600 text-sm">{error}</p>
                {error.includes('not configured') && (
                  <p className="text-red-600 text-xs mt-2">
                    Make sure GOOGLE_SPREADSHEET_ID is set in your .env.local file
                  </p>
                )}
              </div>
            </div>
          )}

          {success && (
            <div className="p-4 border rounded-lg flex items-center" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', borderColor: '#22C55E' }}>
              <CheckCircle className="w-5 h-5 mr-2" style={{ color: '#22C55E' }} />
              <span className="text-white font-medium">
                Successfully connected! Data loaded from Google Sheets.
              </span>
            </div>
          )}
        </div>

        <div className="mt-6 pt-6 border-t" style={{ borderColor: '#3A5A5A' }}>
          <h4 className="text-sm font-medium text-white mb-2">Configuration:</h4>
          <div className="text-sm text-gray-300 space-y-1">
            <p>✅ Sessions Spreadsheet ID: Set via <code className="px-1 rounded" style={{ backgroundColor: '#1A3636' }}>GOOGLE_SPREADSHEET_ID</code> environment variable</p>
            <p>✅ Feedbacks Spreadsheet ID: Set via <code className="px-1 rounded" style={{ backgroundColor: '#1A3636' }}>GOOGLE_FEEDBACKS_SPREADSHEET_ID</code> environment variable</p>
            <p>✅ Service Account: Configured via <code className="px-1 rounded" style={{ backgroundColor: '#1A3636' }}>GOOGLE_SERVICE_ACCOUNT_CREDENTIALS</code></p>
            <p>✅ Permissions: Service account has read access to both spreadsheets</p>
          </div>
        </div>
      </div>

      {/* Requirements Card */}
      <div className="rounded-xl p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#22C55E' }}>
        <h4 className="text-sm font-semibold text-white mb-3">📋 Required Sheet Structure:</h4>
        <div className="text-sm text-gray-300 space-y-2">
          <p>You need <strong>two separate spreadsheets</strong>:</p>
          <div className="space-y-4">
            <div>
              <p className="font-medium text-white mb-2">📊 <strong>Spreadsheet 1</strong> (Sessions - GOOGLE_SPREADSHEET_ID):</p>
              <p className="text-sm text-gray-300 mb-1">Must have <strong>"Mesa tracker"</strong> sheet with these columns:</p>
              <div className="rounded-lg p-3 mt-2" style={{ backgroundColor: '#1A3636' }}>
                <code className="text-xs text-gray-300">
                  S No, Mentor Name, Mentor Email ID, Mentee Name, Mentee Email, 
                  Mentee Ph no, Date, Time, Invite Title, Invitation status, 
                  Mentor Confirmation Status, Mentee Confirmation Status, Session Status, 
                  Comments, Payment Status
                </code>
              </div>
            </div>
            <div>
              <p className="font-medium text-white mb-2">💬 <strong>Spreadsheet 2</strong> (Feedbacks - GOOGLE_FEEDBACKS_SPREADSHEET_ID):</p>
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-gray-300 mb-1">1. <strong>"Mentor Feedbacks filled by candidate"</strong> sheet:</p>
                  <div className="rounded-lg p-3 mt-2" style={{ backgroundColor: '#1A3636' }}>
                    <code className="text-xs text-gray-300">
                      Date, Mentor Email (or Mentor Email ID), Mentee Email (or Candidate Email), 
                      Feedback, Comments
                    </code>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-300 mb-1">2. <strong>"Candidate feedback form filled by mentors"</strong> sheet:</p>
                  <div className="rounded-lg p-3 mt-2" style={{ backgroundColor: '#1A3636' }}>
                    <code className="text-xs text-gray-300">
                      Date, Mentor Email (or Mentor Email ID), Mentee Email (or Candidate Email), 
                      Feedback, Comments
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            ⚠️ Make sure the service account has access to both spreadsheets. Feedbacks will be matched to sessions by Date, Mentor Email, and Mentee Email.
          </p>
        </div>
      </div>
    </div>
  );
};
