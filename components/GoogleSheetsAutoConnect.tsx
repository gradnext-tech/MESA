'use client';

import React, { useState } from 'react';
import { FileSpreadsheet, Loader2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface GoogleSheetsAutoConnectProps {
  onDataLoaded: (data: any[]) => void;
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
        onDataLoaded(result.data.sessions);
        setSuccess(true);
        setSpreadsheetId(result.spreadsheetId);
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
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <div className="flex items-center mb-4">
          <FileSpreadsheet className="w-6 h-6 text-blue-600 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900">
            Connect to Google Sheets
          </h3>
        </div>

        <div className="space-y-4">
          <div className="text-center">
            <p className="text-gray-600 mb-4">
              Your spreadsheet is configured via environment variables.
              {spreadsheetId && (
                <span className="block text-sm text-gray-500 mt-1">
                  Connected to: {spreadsheetId.substring(0, 20)}...
                </span>
              )}
            </p>
            
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleConnect}
                disabled={loading}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center">
              <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
              <span className="text-green-700 font-medium">
                Successfully connected! Data loaded from Google Sheets.
              </span>
            </div>
          )}
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-900 mb-2">Configuration:</h4>
          <div className="text-sm text-gray-600 space-y-1">
            <p>✅ Spreadsheet ID: Set via <code className="bg-gray-100 px-1 rounded">GOOGLE_SPREADSHEET_ID</code> environment variable</p>
            <p>✅ Service Account: Configured via <code className="bg-gray-100 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_CREDENTIALS</code></p>
            <p>✅ Permissions: Service account has read access to your sheet</p>
          </div>
        </div>
      </div>

      {/* Requirements Card */}
      <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
        <h4 className="text-sm font-semibold text-blue-900 mb-3">📋 Required Sheet Structure:</h4>
        <div className="text-sm text-blue-800 space-y-2">
          <p>Your Google Sheet must have a <strong>"Sessions"</strong> sheet with these columns:</p>
          <div className="bg-white bg-opacity-60 rounded-lg p-3 mt-2">
            <code className="text-xs">
              S No, Mentor Name, Mentor Email ID, Mentee Name, Mentee Email, 
              Mentee Ph no, Date, Time, Invite Title, Invitation status, 
              Mentor Confirmation Status, Mentee Confirmation Status, Session Status, 
              Mentor Feedback, Mentee Feedback, Comments, Payment Status
            </code>
          </div>
          <p className="text-xs text-blue-700 mt-2">
            ⚠️ Make sure the service account has access to your spreadsheet
          </p>
        </div>
      </div>
    </div>
  );
};
