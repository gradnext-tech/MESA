'use client';

import React, { useMemo, useState } from 'react';
import { useData } from '@/context/DataContext';
import { parseSessionDate, normalizeSessionStatus } from '@/utils/metricsCalculator';
import { getApiUrl } from '@/utils/api';
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
  // High-level aggregates
  rescheduled: number;
  cancelled: number;
  // Detailed breakdown by actor / outcome
  pending: number;
  studentNoShow: number;
  studentCancelled: number;
  studentRescheduled: number;
  mentorNoShow: number;
  mentorCancelled: number;
  mentorRescheduled: number;
  adminCancelled: number;
  adminRescheduled: number;
}

export default function WeekwiseSessions() {
  const { sessions, hasData, setSessions, setStudents } = useData();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<Date | null>(null);
  const [isWeekwiseExpanded, setIsWeekwiseExpanded] = useState(false);
  const [isSessionDetailsExpanded, setIsSessionDetailsExpanded] = useState(true);
  const [isPendingFeedbackExpanded, setIsPendingFeedbackExpanded] = useState(true);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(getApiUrl('api/sheets'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const result = await response.json();

      if (response.ok && result.success && result.data.sessions) {
        const { parseSpreadsheetData, parseStudentData } = await import('@/utils/metricsCalculator');
        const parsedSessions = parseSpreadsheetData(
          result.data.sessions,
          result.data.mentorFeedbacks || [],
          result.data.candidateFeedbacks || []
        );
        const parsedStudents = parseStudentData(result.data.students || result.data.mentees || []);
        setSessions(parsedSessions);
        setStudents(parsedStudents);
      }
    } catch (error) {
      // Silent error handling
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
      const totalScheduled = weekSessions.length;

      let totalDone = 0;
      let rescheduled = 0;
      let cancelled = 0;

      let pending = 0;
      let studentNoShow = 0;
      let studentCancelled = 0;
      let studentRescheduled = 0;
      let mentorNoShow = 0;
      let mentorCancelled = 0;
      let mentorRescheduled = 0;
      let adminCancelled = 0;
      let adminRescheduled = 0;

      weekSessions.forEach(s => {
        const status = normalizeSessionStatus(s.sessionStatus);

        if (status === 'completed') {
          totalDone++;
          return;
        }

        if (status === 'pending') {
          pending++;
          return;
        }

        // Detailed student-side disruptions
        if (status === 'student_no_show') {
          studentNoShow++;
          return;
        }
        if (status === 'student_cancelled') {
          studentCancelled++;
          cancelled++;
          return;
        }
        if (status === 'student_rescheduled') {
          studentRescheduled++;
          rescheduled++;
          return;
        }

        // Detailed mentor-side disruptions
        if (status === 'mentor_no_show') {
          mentorNoShow++;
          return;
        }
        if (status === 'mentor_cancelled') {
          mentorCancelled++;
          cancelled++;
          return;
        }
        if (status === 'mentor_rescheduled') {
          mentorRescheduled++;
          rescheduled++;
          return;
        }

        // Detailed admin-side disruptions
        if (status === 'admin_cancelled') {
          adminCancelled++;
          cancelled++;
          return;
        }
        if (status === 'admin_rescheduled') {
          adminRescheduled++;
          rescheduled++;
          return;
        }

        // Legacy / unknown cancelled & rescheduled still contribute to high-level aggregates
        if (status === 'unknown_cancelled') {
          cancelled++;
        } else if (status === 'unknown_rescheduled') {
          rescheduled++;
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
        pending,
        studentNoShow,
        studentCancelled,
        studentRescheduled,
        mentorNoShow,
        mentorCancelled,
        mentorRescheduled,
        adminCancelled,
        adminRescheduled,
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
    
    // Fallback: Check studentFeedback if column N is not available
    if (!session.studentFeedback || session.studentFeedback === '' || session.studentFeedback === 'N/A') {
      return 'Not Filled';
    }
    // Check if it's a valid number/rating
    const feedbackValue = parseFloat(String(session.studentFeedback).replace(/[^0-9.]/g, ''));
    if (!isNaN(feedbackValue) && feedbackValue > 0) {
      return 'Filled';
    }
    return 'Not Filled';
  };

  // Calculate mentor-wise pending feedback statistics
  const mentorPendingFeedback = useMemo(() => {
    if (!hasData || filteredSessions.length === 0) {
      return [];
    }

    // Group sessions by mentor
    const mentorMap = new Map<string, {
      mentorName: string;
      mentorEmail: string;
      pendingSessions: Array<{
        date: string;
        studentName: string;
        studentEmail: string;
        sessionStatus: string;
      }>;
    }>();

    filteredSessions.forEach(session => {
      const mentorEmail = (session.mentorEmail || '').trim().toLowerCase();
      const mentorName = session.mentorName || 'Unknown';
      
      if (!mentorEmail) return;

      // Check if feedback is pending
      const feedbackStatus = getMentorFeedbackStatus(session);
      if (feedbackStatus !== 'Filled') {
        // Only count completed sessions for pending feedback
        const status = normalizeSessionStatus(session.sessionStatus);
        if (status === 'completed') {
          if (!mentorMap.has(mentorEmail)) {
            mentorMap.set(mentorEmail, {
              mentorName,
              mentorEmail: session.mentorEmail || '',
              pendingSessions: [],
            });
          }

          const mentorData = mentorMap.get(mentorEmail)!;
          mentorData.pendingSessions.push({
            date: session.date || '',
            studentName: session.studentName || 'Unknown',
            studentEmail: session.studentEmail || '',
            sessionStatus: session.sessionStatus || '',
          });
        }
      }
    });

    // Convert to array and sort by pending count (descending)
    return Array.from(mentorMap.values())
      .filter(mentor => mentor.pendingSessions.length > 0)
      .sort((a, b) => b.pendingSessions.length - a.pendingSessions.length);
  }, [filteredSessions, hasData, getMentorFeedbackStatus]);

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
                  Completed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Pending
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Student No Show
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Student Cancelled
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Student Rescheduled
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Mentor No Show
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Mentor Cancelled
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Mentor Rescheduled
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Admin Cancelled
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Admin Rescheduled
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ backgroundColor: '#2A4A4A' }}>
              {weekwiseStats.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-6 py-8 text-center text-gray-400">
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
                      <span className="text-sm text-gray-300">
                        {stat.pending}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-purple-300">
                        {stat.studentNoShow}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-purple-300">
                        {stat.studentCancelled}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-purple-300">
                        {stat.studentRescheduled}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-red-300">
                        {stat.mentorNoShow}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-red-300">
                        {stat.mentorCancelled}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-red-300">
                        {stat.mentorRescheduled}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-amber-300">
                        {stat.adminCancelled}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-amber-300">
                        {stat.adminRescheduled}
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
        <div 
          className="p-6 border-b cursor-pointer" 
          style={{ borderColor: '#3A5A5A' }}
          onClick={() => setIsSessionDetailsExpanded(!isSessionDetailsExpanded)}
        >
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
            <div className="flex items-center gap-2">
              {selectedWeek && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedWeek(null);
                  }}
                  className="text-sm text-gray-400 hover:text-white px-3 py-1 rounded"
                  style={{ backgroundColor: '#1A3636' }}
                >
                  Clear Filter
                </button>
              )}
              {isSessionDetailsExpanded ? (
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

        {isSessionDetailsExpanded && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b" style={{ backgroundColor: '#1A3636', borderColor: '#3A5A5A' }}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Mentor Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Student Name
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
                        key={`${session.mentorEmail}-${session.studentEmail}-${session.date}-${index}`}
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
                              {session.studentName || 'N/A'}
                            </span>
                            <span className="text-xs text-gray-400">
                              {session.studentEmail || 'N/A'}
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
        )}
      </div>

      {/* Pending Feedback Table - Mentor-wise */}
      {mentorPendingFeedback.length > 0 && (
        <div className="rounded-xl shadow-md border overflow-hidden" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <div 
            className="p-6 border-b cursor-pointer" 
            style={{ borderColor: '#3A5A5A' }}
            onClick={() => setIsPendingFeedbackExpanded(!isPendingFeedbackExpanded)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)' }}>
                  <AlertCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Pending Feedback - Mentor-wise</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Sessions where mentor feedback is yet to be filled ({mentorPendingFeedback.length} mentor{mentorPendingFeedback.length !== 1 ? 's' : ''} with pending feedback)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isPendingFeedbackExpanded ? (
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

          {isPendingFeedbackExpanded && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b" style={{ backgroundColor: '#1A3636', borderColor: '#3A5A5A' }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Mentor Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Mentor Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Pending Count
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Sessions with Pending Feedback
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ backgroundColor: '#2A4A4A' }}>
                {mentorPendingFeedback.map((mentor, index) => (
                  <tr
                    key={`${mentor.mentorEmail}-${index}`}
                    className="transition-colors"
                    style={{ borderColor: '#3A5A5A' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1A3636'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2A4A4A'}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-white">
                        {mentor.mentorName}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-300">
                        {mentor.mentorEmail}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full text-white" style={{ backgroundColor: '#F59E0B' }}>
                        {mentor.pendingSessions.length}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-2">
                        {mentor.pendingSessions.map((session, sessionIndex) => {
                          const sessionDate = parseSessionDate(session.date);
                          return (
                            <div
                              key={`${session.date}-${session.studentEmail}-${sessionIndex}`}
                              className="flex items-center gap-3 text-sm"
                            >
                              <span className="text-gray-300">
                                {sessionDate ? format(sessionDate, 'MMM d, yyyy') : session.date}
                              </span>
                              <span className="text-gray-400">•</span>
                              <span className="text-white font-medium">
                                {session.studentName}
                              </span>
                              <span className="text-xs text-gray-400">
                                ({session.studentEmail})
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
