'use client';

import React, { useMemo, useState } from 'react';
import { useData } from '@/context/DataContext';
import { parseSessionDate, normalizeSessionStatus } from '@/utils/metricsCalculator';
import {
  Calendar,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { startOfWeek, endOfWeek, format, eachWeekOfInterval, min, max, isWithinInterval, startOfDay } from 'date-fns';
import Link from 'next/link';

interface WeekwiseStats {
  weekStart: Date;
  weekEnd: Date;
  weekLabel: string;
  totalScheduled: number;
  totalDone: number;
  rescheduled: number;
  cancelled: number;
}

export default function WeekwiseSessions() {
  const { sessions, hasData, setSessions, setMentees } = useData();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<Date | null>(null);
  const [isWeekwiseExpanded, setIsWeekwiseExpanded] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
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
        const { parseSpreadsheetData, parseMenteeData } = await import('@/utils/metricsCalculator');
        const parsedSessions = parseSpreadsheetData(
          result.data.sessions,
          result.data.mentorFeedbacks || [],
          result.data.candidateFeedbacks || []
        );
        const parsedMentees = parseMenteeData(result.data.mentees || []);
        setSessions(parsedSessions);
        setMentees(parsedMentees);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Calculate weekwise statistics
  const weekwiseStats = useMemo(() => {
    if (!hasData || sessions.length === 0) {
      return [];
    }

    // Get all session dates
    const sessionDates: Date[] = [];
    sessions.forEach(s => {
      if (!s.date) return;
      const parsedDate = parseSessionDate(s.date);
      if (parsedDate) {
        sessionDates.push(parsedDate);
      }
    });

    if (sessionDates.length === 0) {
      return [];
    }

    // Find date range
    const minDate = min(sessionDates);
    const maxDate = max(sessionDates);

    // Generate all weeks in the range (Monday to Sunday)
    const weeks = eachWeekOfInterval(
      { start: minDate, end: maxDate },
      { weekStartsOn: 1 } // Monday
    );

    // Calculate statistics for each week
    const stats: WeekwiseStats[] = weeks.map(weekStart => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekStartNormalized = startOfDay(weekStart);
      const weekEndNormalized = startOfDay(weekEnd);

      // Filter sessions for this week
      const weekSessions = sessions.filter(s => {
        if (!s.date) return false;
        const sessionDate = parseSessionDate(s.date);
        if (!sessionDate) return false;
        const sessionDateNormalized = startOfDay(sessionDate);
        return isWithinInterval(sessionDateNormalized, {
          start: weekStartNormalized,
          end: weekEndNormalized,
        });
      });

      // Calculate statistics
      let totalScheduled = weekSessions.length;
      let totalDone = 0;
      let rescheduled = 0;
      let cancelled = 0;

      weekSessions.forEach(s => {
        const status = normalizeSessionStatus(s.sessionStatus);
        if (status === 'completed') {
          totalDone++;
        }
        // Count all types of rescheduled (mentee, mentor, admin, and legacy)
        if (status === 'mentee_rescheduled' || status === 'mentor_rescheduled' || 
            status === 'admin_rescheduled' || status === 'unknown_rescheduled') {
          rescheduled++;
        }
        // Count all types of cancelled (mentee, mentor, admin, and legacy)
        if (status === 'mentee_cancelled' || status === 'mentor_cancelled' || 
            status === 'admin_cancelled' || status === 'unknown_cancelled') {
          cancelled++;
        }
      });

      return {
        weekStart,
        weekEnd,
        weekLabel: `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`,
        totalScheduled,
        totalDone,
        rescheduled,
        cancelled,
      };
    });

    // Sort by week start date (most recent first)
    return stats.sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
  }, [sessions, hasData]);

  // Filter sessions based on selected week
  const filteredSessions = useMemo(() => {
    if (!selectedWeek) {
      // If no week selected, show all sessions
      return sessions;
    }

    const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: 1 });
    const weekStartNormalized = startOfDay(weekStart);
    const weekEndNormalized = startOfDay(weekEnd);

    return sessions.filter(s => {
      if (!s.date) return false;
      const sessionDate = parseSessionDate(s.date);
      if (!sessionDate) return false;
      const sessionDateNormalized = startOfDay(sessionDate);
      return isWithinInterval(sessionDateNormalized, {
        start: weekStartNormalized,
        end: weekEndNormalized,
      });
    });
  }, [sessions, selectedWeek]);

  // Get mentor feedback status for a session - use column N from MESA sheet
  const getMentorFeedbackStatus = (session: any): string => {
    // First, check column N (mentorFeedbackStatus) from MESA sheet
    const feedbackStatus = (session.mentorFeedbackStatus || '').trim();
    if (feedbackStatus) {
      const lowerStatus = feedbackStatus.toLowerCase();
      if (lowerStatus === 'filled' || lowerStatus === 'yes' || lowerStatus === 'done' || lowerStatus === 'complete') {
        return 'Filled';
      }
      if (lowerStatus === 'not filled' || lowerStatus === 'no' || lowerStatus === 'pending' || lowerStatus === '') {
        return 'Not Filled';
      }
      // If it's a specific status, return it as-is (capitalized)
      return feedbackStatus.charAt(0).toUpperCase() + feedbackStatus.slice(1).toLowerCase();
    }
    
    // Fallback: Check menteeFeedback if column N is not available
    if (!session.menteeFeedback || session.menteeFeedback === '' || session.menteeFeedback === 'N/A') {
      return 'Not Filled';
    }
    // Check if it's a valid number/rating
    const feedbackValue = parseFloat(String(session.menteeFeedback).replace(/[^0-9.]/g, ''));
    if (!isNaN(feedbackValue) && feedbackValue > 0) {
      return 'Filled';
    }
    return 'Not Filled';
  };

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <AlertCircle className="w-16 h-16 text-gray-400 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">No Data Available</h2>
        <p className="text-gray-300 mb-6">Please upload your session data first</p>
        <Link
          href="/"
          className="px-6 py-3 text-white rounded-lg transition-colors"
          style={{ backgroundColor: '#22C55E' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#16A34A'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#22C55E'}
        >
          Go to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">All Session Details</h1>
          <p className="text-gray-300 mt-1">
            Overview of all sessions organized by week (Monday to Sunday)
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ 
            backgroundColor: isRefreshing ? '#3A5A5A' : '#22C55E',
            color: '#fff'
          }}
          onMouseEnter={(e) => {
            if (!isRefreshing) {
              e.currentTarget.style.backgroundColor = '#16A34A';
            }
          }}
          onMouseLeave={(e) => {
            if (!isRefreshing) {
              e.currentTarget.style.backgroundColor = '#22C55E';
            }
          }}
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>

      {/* Weekwise Statistics Table */}
      <div className="rounded-xl shadow-md border overflow-hidden" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
        <div 
          className="p-6 border-b cursor-pointer" 
          style={{ borderColor: '#3A5A5A' }}
          onClick={() => setIsWeekwiseExpanded(!isWeekwiseExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)' }}>
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Session Overview by Week</h3>
                <p className="text-xs text-gray-400 mt-1">All sessions grouped by week (Monday to Sunday)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isWeekwiseExpanded ? (
                <>
                  <span className="text-xs text-gray-400">Click to collapse</span>
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                </>
              ) : (
                <>
                  <span className="text-xs text-gray-400">Click to expand</span>
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                </>
              )}
            </div>
          </div>
        </div>

        {isWeekwiseExpanded && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b" style={{ backgroundColor: '#1A3636', borderColor: '#3A5A5A' }}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Week Start (Monday)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Week Range
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Total Scheduled
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Total Done
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Rescheduled
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Cancelled
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ backgroundColor: '#2A4A4A' }}>
              {weekwiseStats.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    No session data available
                  </td>
                </tr>
              ) : (
                weekwiseStats.map((stat, index) => {
                  const isSelected = selectedWeek && 
                    stat.weekStart.getTime() === startOfWeek(selectedWeek, { weekStartsOn: 1 }).getTime();
                  return (
                  <tr
                    key={stat.weekStart.toISOString()}
                    className="transition-colors cursor-pointer"
                    style={{ 
                      borderColor: '#3A5A5A',
                      backgroundColor: isSelected ? '#1A3636' : '#2A4A4A'
                    }}
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent triggering the header collapse
                      // Toggle selection - if same week clicked, deselect
                      if (isSelected) {
                        setSelectedWeek(null);
                      } else {
                        setSelectedWeek(stat.weekStart);
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = '#1A3636';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = '#2A4A4A';
                      }
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-white">
                          {format(stat.weekStart, 'MMM d, yyyy')}
                        </span>
                        <span className="text-xs text-gray-400">
                          {format(stat.weekStart, 'EEEE')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-300">
                        {stat.weekLabel}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold text-white">
                        {stat.totalScheduled}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full" style={{ backgroundColor: '#22C55E', color: '#fff' }}>
                        {stat.totalDone}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-yellow-400">
                        {stat.rescheduled}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-red-400">
                        {stat.cancelled}
                      </span>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Session-wise Data Table */}
      <div className="rounded-xl shadow-md border overflow-hidden" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
        <div className="p-6 border-b" style={{ borderColor: '#3A5A5A' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)' }}>
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Session Details</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {selectedWeek 
                    ? `Sessions for week: ${format(startOfWeek(selectedWeek, { weekStartsOn: 1 }), 'MMM d')} - ${format(endOfWeek(selectedWeek, { weekStartsOn: 1 }), 'MMM d, yyyy')}`
                    : 'All sessions (click on a week above to filter)'}
                </p>
              </div>
            </div>
            {selectedWeek && (
              <button
                onClick={() => setSelectedWeek(null)}
                className="text-sm text-gray-400 hover:text-white px-3 py-1 rounded"
                style={{ backgroundColor: '#1A3636' }}
              >
                Clear Filter
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b" style={{ backgroundColor: '#1A3636', borderColor: '#3A5A5A' }}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Mentor Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Mentee Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Session Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Session Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Mentor Feedback Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ backgroundColor: '#2A4A4A' }}>
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                    {selectedWeek ? 'No sessions found for the selected week' : 'No session data available'}
                  </td>
                </tr>
              ) : (
                filteredSessions
                  .sort((a, b) => {
                    // Sort by date (most recent first)
                    const dateA = parseSessionDate(a.date);
                    const dateB = parseSessionDate(b.date);
                    if (!dateA || !dateB) return 0;
                    return dateB.getTime() - dateA.getTime();
                  })
                  .map((session, index) => {
                    const status = normalizeSessionStatus(session.sessionStatus);
                    const feedbackStatus = getMentorFeedbackStatus(session);
                    const sessionDate = parseSessionDate(session.date);
                    
                    // Get status display color - using dull/muted colors for less contrast
                    let statusColor = '#6B7280'; // Default muted gray
                    if (status === 'completed') {
                      statusColor = '#4ADE80'; // Muted green
                    } else if (status.includes('cancelled')) {
                      statusColor = '#F87171'; // Muted red
                    } else if (status.includes('rescheduled')) {
                      statusColor = '#FBBF24'; // Muted yellow/amber
                    } else if (status.includes('no_show')) {
                      statusColor = '#FB923C'; // Muted orange
                    } else if (status === 'pending') {
                      statusColor = '#9CA3AF'; // Muted gray
                    }

                    return (
                      <tr
                        key={`${session.mentorEmail}-${session.menteeEmail}-${session.date}-${index}`}
                        className="transition-colors"
                        style={{ borderColor: '#3A5A5A' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1A3636'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2A4A4A'}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-white">
                              {session.mentorName || 'N/A'}
                            </span>
                            <span className="text-xs text-gray-400">
                              {session.mentorEmail || 'N/A'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-white">
                              {session.menteeName || 'N/A'}
                            </span>
                            <span className="text-xs text-gray-400">
                              {session.menteeEmail || 'N/A'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-300">
                            {sessionDate ? format(sessionDate, 'MMM d, yyyy') : session.date || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span 
                            className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full text-white"
                            style={{ backgroundColor: statusColor }}
                          >
                            {session.sessionStatus || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span 
                            className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              feedbackStatus === 'Filled' 
                                ? 'text-white' 
                                : 'text-gray-300'
                            }`}
                            style={{ 
                              backgroundColor: feedbackStatus === 'Filled' ? '#22C55E' : '#6B7280'
                            }}
                          >
                            {feedbackStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
