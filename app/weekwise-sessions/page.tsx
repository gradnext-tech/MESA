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
  FileCheck2,
  Mail,
} from 'lucide-react';
import { startOfWeek, endOfWeek, format, eachWeekOfInterval, min, max, isWithinInterval, startOfDay, differenceInCalendarWeeks } from 'date-fns';
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
  const { sessions, hasData, setSessions, setStudents, candidateFeedbacks, setCandidateFeedbacks } = useData();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGeneratingReports, setIsGeneratingReports] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [sendingSessionKey, setSendingSessionKey] = useState<string | null>(null);
  const [selectedSendStudents, setSelectedSendStudents] = useState<string[]>([]);
  const [selectedSendWeekStart, setSelectedSendWeekStart] = useState<Date | null>(null);
  const [selectedReportCandidates, setSelectedReportCandidates] = useState<string[]>([]);
  const [selectedReportWeekStart, setSelectedReportWeekStart] = useState<Date | null>(null);
  const [isAllStudentsForWeek, setIsAllStudentsForWeek] = useState(false);
  const [selectedStudentForHistory, setSelectedStudentForHistory] = useState<string>('');
  const [reportMode, setReportMode] = useState<'weekly' | 'studentHistory' | 'allTillDate'>('weekly');
  const [selectedWeek, setSelectedWeek] = useState<Date | null>(null);
  const [isWeekwiseExpanded, setIsWeekwiseExpanded] = useState(false);
  const [isSessionDetailsExpanded, setIsSessionDetailsExpanded] = useState(true);
  const [isPendingFeedbackExpanded, setIsPendingFeedbackExpanded] = useState(true);
  const [generatedSessionKeys, setGeneratedSessionKeys] = useState<string[]>([]);
  const [lastReportSummary, setLastReportSummary] = useState<string | null>(null);
  const [lastReportErrors, setLastReportErrors] = useState<string[]>([]);
  const [reportLog, setReportLog] = useState<string[]>([]);

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
        setCandidateFeedbacks(result.data.candidateFeedbacks || []);
      }
    } catch (error) {
      // Silent error handling
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleGenerateReports = () => {
    setReportMode('weekly');
    setIsReportModalOpen(true);
  };

  const earliestSessionDate = useMemo(() => {
    if (!sessions.length) return null;
    let earliest: Date | null = null;
    sessions.forEach(s => {
      if (!s.date) return;
      const d = parseSessionDate(s.date);
      if (!d) return;
      if (!earliest || d.getTime() < earliest.getTime()) {
        earliest = d;
      }
    });
    return earliest;
  }, [sessions]);

  const uniqueCandidateNames = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach(s => {
      if (s.studentName) set.add(s.studentName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  const studentNameToEmail = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach(s => {
      if (s.studentName && s.studentEmail) {
        const key = s.studentName.trim();
        if (!map.has(key)) map.set(key, s.studentEmail);
      }
    });
    return map;
  }, [sessions]);

  const getProgramWeekNumber = (date: Date): number => {
    if (!earliestSessionDate) return 1;
    const programWeek1Start = startOfWeek(startOfDay(earliestSessionDate), { weekStartsOn: 1 });
    const sessionWeekStart = startOfWeek(startOfDay(date), { weekStartsOn: 1 });
    const diffWeeks = differenceInCalendarWeeks(sessionWeekStart, programWeek1Start, {
      weekStartsOn: 1,
    });
    return diffWeeks + 1;
  };

  const handleSubmitReportGeneration = async () => {
    const candidatesToRun = isAllStudentsForWeek
      ? uniqueCandidateNames
      : selectedReportCandidates;

    if (!candidatesToRun.length || !selectedReportWeekStart) {
      return;
    }
    setIsGeneratingReports(true);
    setLastReportSummary(null);
    setLastReportErrors([]);
    setReportLog([`Report generation started. Week ${getProgramWeekNumber(selectedReportWeekStart)}. Students: ${candidatesToRun.join(', ')}`]);
    try {
      const weekNumber = getProgramWeekNumber(selectedReportWeekStart);

      const response = await fetch(getApiUrl('api/generate-session-reports'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          weekNumber,
          ...(isAllStudentsForWeek
            ? { allCandidatesForWeek: true }
            : { candidateNames: candidatesToRun }),
          dryRun: false,
        }),
      });
      let result: any = null;
      try {
        result = await response.json();
      } catch {
        const text = await response.text().catch(() => '');
        const statusLine = `HTTP ${response.status} ${response.statusText}`.trim();
        setReportLog(prev => [
          ...prev,
          `ERROR: Non-JSON response from generate API (${statusLine}).`,
          text ? `Response (first 500 chars): ${text.slice(0, 500)}` : '',
        ]);
        setLastReportSummary('Failed to generate reports.');
        setLastReportErrors([`Non-JSON response from server (${statusLine}).`]);
        return;
      }

      const apiLog: string[] = Array.isArray(result.log) ? result.log : [];
      setReportLog(prev => [...prev, ...apiLog]);

      if (response.ok && result.success) {
        const totalCreated = Number(result.created || 0);
        const keys: string[] = Array.isArray(result.generatedSessionsKeys)
          ? result.generatedSessionsKeys
          : [];
        const allErrors: string[] = [];
        if (Array.isArray(result.errors)) {
          result.errors.forEach((e: any) => {
            if (e?.error) allErrors.push(e.error);
          });
        }
        setReportLog(prev => [...prev, `\n--- Done. Total created: ${totalCreated}, errors: ${allErrors.length} ---`]);
        setGeneratedSessionKeys(prev => Array.from(new Set([...(prev || []), ...keys])));
        setLastReportSummary(
          `Created ${totalCreated} report(s) for ${candidatesToRun.length} student(s) in week ${weekNumber}.`
        );
        setLastReportErrors(allErrors);
      } else {
        const errMsg = result?.error || result?.message || 'Unknown';
        setReportLog(prev => [...prev, `  ERROR: ${errMsg}`, `\n--- Done. Total created: 0, errors: 1 ---`]);
        setLastReportSummary('Failed to generate reports.');
        setLastReportErrors([errMsg]);
      }
    } catch (err: any) {
      setReportLog(prev => [...prev, `Fatal: ${err?.message || String(err)}`]);
      setLastReportErrors([err?.message || String(err)]);
    } finally {
      setIsGeneratingReports(false);
    }
  };

  const handleGenerateAllReportsTillDate = async () => {
    setIsGeneratingReports(true);
    setLastReportSummary(null);
    setLastReportErrors([]);
    setReportLog(['Report generation (all till date) started...']);
    try {
      const response = await fetch(getApiUrl('api/generate-session-reports'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });
      const result = await response.json();
      if (Array.isArray(result.log)) {
        setReportLog(prev => [...prev, ...result.log]);
      }
      if (response.ok && result.success) {
        const keys: string[] = Array.isArray(result.generatedSessionsKeys)
          ? result.generatedSessionsKeys
          : [];
        setGeneratedSessionKeys(prev => Array.from(new Set([...(prev || []), ...keys])));
        setLastReportSummary(
          `Created ${Number(result.created || 0)} report(s) for all students across all weeks.`
        );
        if (Array.isArray(result.errors)) {
          const errs: string[] = [];
          result.errors.forEach((e: any) => {
            if (e?.error) errs.push(e.error);
          });
          setLastReportErrors(errs);
        }
        setReportLog(prev => [...prev, `Done. created=${result.created}, skipped=${result.skipped}, errors=${(result.errors || []).length}`]);
      } else {
        setLastReportSummary('Failed to generate reports for all sessions.');
        if (result?.error || result?.message) {
          setLastReportErrors([result.error || result.message]);
          setReportLog(prev => [...prev, `ERROR: ${result.error || result.message}`, result?.details ? `Details: ${result.details}` : '']);
        }
      }
    } catch (e: any) {
      setLastReportSummary('Failed to generate reports for all sessions.');
      setLastReportErrors([e?.message || String(e || 'unknown')]);
      setReportLog(prev => [...prev, `Fatal: ${e?.message || String(e)}`]);
    } finally {
      setIsGeneratingReports(false);
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

        // No further legacy statuses
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

  // Read "Report Generated" / "Report Sent" from feedback sheet (Candidate feedback form filled by mentors)
  const getReportStatusFromSheet = (session: any): { reportGenerated: boolean; reportSent: boolean } => {
    if (!candidateFeedbacks || candidateFeedbacks.length === 0) {
      return { reportGenerated: false, reportSent: false };
    }
    const sessionDate = parseSessionDate(session.date || session['Session Date'] || session['Date of Session'] || '');
    const studentName = String(session.studentName || '').trim().toLowerCase();
    const mentorName = String(session.mentorName || '').trim().toLowerCase();
    for (const row of candidateFeedbacks) {
      const rowName = String(row['Candidate Name'] || row['Mentee Name'] || row['Student Name'] || row['Name'] || '').trim().toLowerCase();
      const rowMentor = String(row['Mentor Name'] || row['Interviewer'] || row['Mentor'] || '').trim().toLowerCase();
      const rowDateRaw = row['Session Date'] || row['Date of Session'] || row['date'] || row['Date'] || row['Timestamp'] || '';
      const rowDate = parseSessionDate(rowDateRaw);
      if (!rowDate || !sessionDate) continue;
      const sameDay = rowDate.getFullYear() === sessionDate.getFullYear() && rowDate.getMonth() === sessionDate.getMonth() && rowDate.getDate() === sessionDate.getDate();
      if (rowName !== studentName || rowMentor !== mentorName || !sameDay) continue;
      const genRaw = String(row['is report generated'] ?? row['Report Generated'] ?? row['report generated'] ?? '').trim().toLowerCase();
      const sentRaw = String(row['Report Sent'] ?? row['report sent'] ?? '').trim().toLowerCase();
      const reportGenerated = ['yes', 'true', 'done', 'generated'].includes(genRaw);
      const reportSent = ['yes', 'true', 'sent'].includes(sentRaw);
      return { reportGenerated, reportSent };
    }
    return { reportGenerated: false, reportSent: false };
  };

  const isFeedbackGeneratedForSession = (session: any): boolean => {
    const fromSheet = getReportStatusFromSheet(session);
    if (fromSheet.reportGenerated) return true;
    const rawDate = session.date || session['Session Date'] || session['Date of Session'] || '';
    const key = `${String(session.studentName || '').trim()}|${String(session.mentorName || '').trim()}|${String(rawDate)}`;
    return generatedSessionKeys.includes(key);
  };

  const canSubmit =
    reportMode === 'weekly'
      ? !!selectedReportWeekStart &&
        (isAllStudentsForWeek
          ? uniqueCandidateNames.length > 0
          : selectedReportCandidates.length > 0)
      : reportMode === 'studentHistory'
      ? !!selectedStudentForHistory
      : true;

  const handleSubmitGenerate = async () => {
    if (reportMode === 'weekly') {
      await handleSubmitReportGeneration();
    } else if (reportMode === 'studentHistory') {
      if (!selectedStudentForHistory) return;
      setIsGeneratingReports(true);
      setLastReportSummary(null);
      setLastReportErrors([]);
      setReportLog([`Report generation (student history) started: ${selectedStudentForHistory}`]);
      try {
        const response = await fetch(getApiUrl('api/generate-session-reports'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidateName: selectedStudentForHistory,
            dryRun: false,
          }),
        });
        const result = await response.json();
        if (Array.isArray(result.log)) {
          setReportLog(prev => [...prev, ...result.log]);
        }
        if (response.ok && result.success) {
          const keys: string[] = Array.isArray(result.generatedSessionsKeys)
            ? result.generatedSessionsKeys
            : [];
          setGeneratedSessionKeys(prev => Array.from(new Set([...(prev || []), ...keys])));
          setLastReportSummary(
            `Created ${Number(result.created || 0)} report(s) for ${selectedStudentForHistory} (all weeks).`
          );
          if (Array.isArray(result.errors)) {
            const errs: string[] = [];
            result.errors.forEach((e: any) => {
              if (e?.error) errs.push(e.error);
            });
            setLastReportErrors(errs);
          }
          setReportLog(prev => [...prev, `Done. created=${result.created}, skipped=${result.skipped}, errors=${(result.errors || []).length}`]);
        } else {
          setLastReportSummary(`Failed to generate reports for ${selectedStudentForHistory}.`);
          if (result?.error || result?.message) {
            setLastReportErrors([result.error || result.message]);
            setReportLog(prev => [...prev, `ERROR: ${result.error || result.message}`, result?.details ? `Details: ${result.details}` : '']);
          }
        }
      } catch (e: any) {
        setLastReportSummary(`Failed to generate reports for ${selectedStudentForHistory}.`);
        setLastReportErrors([e?.message || String(e || 'unknown')]);
        setReportLog(prev => [...prev, `Fatal: ${e?.message || String(e)}`]);
      } finally {
        setIsGeneratingReports(false);
      }
    } else {
      await handleGenerateAllReportsTillDate();
    }
    setIsReportModalOpen(false);
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
      {/* Generate report modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-900/70 via-slate-900/40 to-emerald-900/60 backdrop-blur-sm">
          <form
            className="bg-[#102525] border border-[#3A5A5A] rounded-2xl p-6 w-full max-w-xl shadow-2xl"
            onSubmit={(e) => {
              e.preventDefault();
              if (!canSubmit || isGeneratingReports) return;
              handleSubmitGenerate();
            }}
          >
            <h2 className="text-xl font-semibold text-white mb-2">Generate Session Reports</h2>
            <p className="text-xs text-gray-300 mb-4">
              Choose what you want to generate: weekly candidate reports, full history for a student, or all reports till date.
            </p>
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#152c2c] p-1 border border-[#264343]">
                <button
                  type="button"
                  onClick={() => setReportMode('weekly')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    reportMode === 'weekly'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-gray-200 hover:bg-[#1f3a3a]'
                  }`}
                >
                  Weekly (by week)
                </button>
                <button
                  type="button"
                  onClick={() => setReportMode('studentHistory')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    reportMode === 'studentHistory'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-gray-200 hover:bg-[#1f3a3a]'
                  }`}
                >
                  Student history
                </button>
                <button
                  type="button"
                  onClick={() => setReportMode('allTillDate')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    reportMode === 'allTillDate'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-gray-200 hover:bg-[#1f3a3a]'
                  }`}
                >
                  All reports (till date)
                </button>
              </div>

              {reportMode === 'weekly' && (
                <>
                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#173232] border border-[#3A5A5A]">
                    <div className="flex flex-col">
                      <span className="text-sm text-gray-100">
                        Generate for all students in selected week
                      </span>
                      <span className="text-xs text-gray-400">
                        When enabled, reports will be generated for every student with sessions in the chosen week.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAllStudentsForWeek(v => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        isAllStudentsForWeek ? 'bg-emerald-500' : 'bg-gray-500'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isAllStudentsForWeek ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Students</label>
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-[#3A5A5A] bg-[#1a3434] p-2 space-y-1">
                        {uniqueCandidateNames.map(name => {
                          const checked = selectedReportCandidates.includes(name);
                          return (
                            <label
                              key={name}
                              className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isAllStudentsForWeek ? true : checked}
                                disabled={isAllStudentsForWeek}
                                onChange={() => {
                                  setSelectedReportCandidates(prev =>
                                    checked ? prev.filter(n => n !== name) : [...prev, name]
                                  );
                                }}
                                className="w-4 h-4 rounded border-[#3A5A5A]"
                              />
                              <span>{name}</span>
                            </label>
                          );
                        })}
                        {uniqueCandidateNames.length === 0 && (
                          <p className="text-xs text-gray-400">No students found.</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Week (start date)</label>
                      <select
                        className="w-full px-3 py-2 rounded-lg border text-sm bg-[#1a3434] border-[#3A5A5A] text-white"
                        value={
                          selectedReportWeekStart
                            ? startOfWeek(selectedReportWeekStart, { weekStartsOn: 1 }).toISOString()
                            : ''
                        }
                        onChange={(e) => {
                          if (!e.target.value) {
                            setSelectedReportWeekStart(null);
                          } else {
                            setSelectedReportWeekStart(new Date(e.target.value));
                          }
                        }}
                      >
                        <option value="">Select week</option>
                        {weekwiseStats.map(stat => {
                          const ws = startOfWeek(stat.weekStart, { weekStartsOn: 1 });
                          return (
                            <option key={ws.toISOString()} value={ws.toISOString()}>
                              {stat.weekLabel}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {reportMode === 'studentHistory' && (
                <div className="space-y-2 rounded-lg border border-[#3A5A5A] bg-[#173232] p-4">
                  <p className="text-xs text-gray-300 mb-1">
                    Generate reports for every session of a single student across all weeks.
                  </p>
                  <label className="block text-sm text-gray-300 mb-1">Student</label>
                  <select
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[#1a3434] border-[#3A5A5A] text-white"
                    value={selectedStudentForHistory}
                    onChange={(e) => setSelectedStudentForHistory(e.target.value)}
                  >
                    <option value="">Select student</option>
                    {uniqueCandidateNames.map(name => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {reportMode === 'allTillDate' && (
                <div className="space-y-2 rounded-lg border border-[#3A5A5A] bg-[#173232] p-4">
                  <h3 className="text-sm font-medium text-gray-100">All reports till date</h3>
                  <p className="text-xs text-gray-300">
                    This will generate missing reports for all students across all sessions and weeks.
                    Existing reports in Drive will not be deleted.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="px-4 py-2 text-sm rounded-lg bg-[#1a3434] text-gray-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingReports || !canSubmit}
                  className="px-4 py-2 text-sm rounded-lg bg-[#22C55E] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingReports ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Send reports modal: multi-select students + week, then send the concatenated weekly report */}
      {isSendModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-900/70 via-slate-900/40 to-emerald-900/60 backdrop-blur-sm">
          <div className="bg-[#102525] border border-[#3A5A5A] rounded-2xl p-6 w-full max-w-xl shadow-2xl">
            <h2 className="text-xl font-semibold text-white mb-2">Send reports to students</h2>
            <p className="text-xs text-gray-300 mb-4">
              Select one or more students and a week. The system will search that week folder in Drive, find each student&apos;s concatenated report, and send it.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Students</label>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-[#3A5A5A] bg-[#1a3434] p-2 space-y-1">
                  {uniqueCandidateNames.map((name) => {
                    const checked = selectedSendStudents.includes(name);
                    const hasEmail = !!studentNameToEmail.get(name);
                    return (
                      <label
                        key={name}
                        className={`flex items-center gap-2 text-sm cursor-pointer ${!hasEmail ? 'opacity-60' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!hasEmail}
                          onChange={() => {
                            setSelectedSendStudents((prev) =>
                              checked ? prev.filter((n) => n !== name) : [...prev, name]
                            );
                          }}
                          className="w-4 h-4 rounded border-[#3A5A5A]"
                        />
                        <span className="text-gray-200">
                          {name}
                          {hasEmail ? (
                            <span className="text-gray-400 text-xs ml-1">
                              ({studentNameToEmail.get(name)})
                            </span>
                          ) : (
                            <span className="text-amber-400 text-xs ml-1">(no email)</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                  {uniqueCandidateNames.length === 0 && (
                    <p className="text-xs text-gray-400">No students found.</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Week</label>
                <select
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-[#1a3434] border-[#3A5A5A] text-white"
                  value={
                    selectedSendWeekStart
                      ? startOfWeek(selectedSendWeekStart, { weekStartsOn: 1 }).toISOString()
                      : ''
                  }
                  onChange={(e) => {
                    if (!e.target.value) {
                      setSelectedSendWeekStart(null);
                    } else {
                      setSelectedSendWeekStart(new Date(e.target.value));
                    }
                  }}
                >
                  <option value="">Select week</option>
                  {weekwiseStats.map((stat) => {
                    const ws = startOfWeek(stat.weekStart, { weekStartsOn: 1 });
                    return (
                      <option key={ws.toISOString()} value={ws.toISOString()}>
                        {stat.weekLabel}
                      </option>
                    );
                  })}
                </select>
              </div>
              {lastReportSummary && (
                <p className={`text-sm ${lastReportErrors.length ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {lastReportSummary}
                </p>
              )}
              {lastReportErrors.length > 0 && (
                <ul className="text-xs text-amber-400 list-disc list-inside">
                  {lastReportErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-[#3A5A5A]">
              <button
                type="button"
                onClick={() => {
                  setIsSendModalOpen(false);
                  setSelectedSendStudents([]);
                  setLastReportSummary(null);
                  setLastReportErrors([]);
                }}
                className="px-4 py-2 text-sm rounded-lg bg-[#1a3434] text-gray-300 hover:text-white"
              >
                Close
              </button>
              <button
                type="button"
                disabled={
                  selectedSendStudents.length === 0 ||
                  !selectedSendWeekStart ||
                  selectedSendStudents.some((n) => !studentNameToEmail.get(n)) ||
                  isGeneratingReports
                }
                onClick={async () => {
                  const toSend = selectedSendStudents.filter((n) => studentNameToEmail.get(n));
                  if (!toSend.length || !selectedSendWeekStart) return;
                  setIsGeneratingReports(true);
                  setLastReportSummary(null);
                  setLastReportErrors([]);
                  const weekNumber = getProgramWeekNumber(selectedSendWeekStart);
                  let sent = 0;
                  const errs: string[] = [];
                  for (const name of toSend) {
                    const email = studentNameToEmail.get(name);
                    if (!email) continue;
                    try {
                      const response = await fetch(getApiUrl('api/send-session-report-email'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          menteeEmail: email,
                          menteeName: name,
                          weekNumber,
                        }),
                      });
                      const result = await response.json();
                      if (response.ok && result.success && !result.alreadySent) {
                        sent++;
                      } else if (!response.ok || !result.success) {
                        errs.push(`${name}: ${result?.error || result?.details || 'Unknown error'}`);
                      }
                    } catch (e: any) {
                      errs.push(`${name}: ${e?.message || String(e)}`);
                    }
                  }
                  setLastReportSummary(
                    sent > 0
                      ? `Sent ${sent} report(s)${errs.length ? `. ${errs.length} failed.` : '.'}`
                      : errs.length
                        ? 'Failed to send reports.'
                        : 'All selected reports were already sent.'
                  );
                  setLastReportErrors(errs);
                  if (sent > 0) await handleRefresh();
                  setIsGeneratingReports(false);
                }}
                className="px-4 py-2 text-sm rounded-lg bg-[#F59E0B] hover:bg-[#D97706] text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingReports ? 'Sending...' : `Send report${selectedSendStudents.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">All Session Details</h1>
          <p className="text-gray-300 mt-1">
            Overview of all sessions organized by week (Monday to Sunday)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerateReports}
            disabled={isGeneratingReports}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-[#22C55E] hover:bg-[#16A34A] text-white shadow-sm border border-transparent"
          >
            <FileCheck2 className={`w-4 h-4 ${isGeneratingReports ? 'animate-pulse' : ''}`} />
            {isGeneratingReports ? 'Generating Reports...' : 'Generate Reports'}
          </button>
          <button
            onClick={() => setIsSendModalOpen(true)}
            disabled={isGeneratingReports}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-[#F59E0B] hover:bg-[#D97706] text-white shadow-sm border border-transparent"
          >
            <Mail className="w-4 h-4" />
            Send reports
          </button>
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
      </div>

      {/* Last report status + full log */}
      {(lastReportSummary || reportLog.length > 0) && (
        <div className="rounded-lg border border-[#3A5A5A] bg-[#1A3636] p-4 space-y-3">
          {lastReportSummary && (
            <p className="text-sm text-gray-100">{lastReportSummary}</p>
          )}
          {lastReportErrors.length > 0 && (
            <ul className="text-xs text-red-300 list-disc list-inside space-y-1">
              {lastReportErrors.slice(0, 5).map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
              {lastReportErrors.length > 5 && (
                <li>+{lastReportErrors.length - 5} more error(s)</li>
              )}
            </ul>
          )}
          {reportLog.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-300 mb-1">Full log</p>
              <pre className="text-xs text-gray-400 bg-[#0f1f1f] border border-[#3A5A5A] rounded-lg p-3 max-h-80 overflow-y-auto whitespace-pre-wrap font-mono">
                {reportLog.join('\n')}
              </pre>
            </div>
          )}
        </div>
      )}

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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Feedback Generated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Report Email
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ backgroundColor: '#2A4A4A' }}>
                {filteredSessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
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
                      return dateA.getTime() - dateB.getTime();
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

                      const displayStatus = (!session.sessionStatus || session.sessionStatus.toLowerCase() === 'unknown')
                        ? 'Upcoming'
                        : session.sessionStatus;

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
                              {displayStatus}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                feedbackStatus === 'Filled' ? 'text-white' : 'text-gray-300'
                              }`}
                              style={{
                                backgroundColor:
                                  feedbackStatus === 'Filled' ? '#22C55E' : '#6B7280',
                              }}
                            >
                              {feedbackStatus}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {isFeedbackGeneratedForSession(session) ? (
                              <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full text-white" style={{ backgroundColor: '#22C55E' }}>
                                Generated
                              </span>
                            ) : (
                              <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full text-gray-300" style={{ backgroundColor: '#4B5563' }}>
                                Not Generated
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {(() => {
                              const { reportGenerated: fromSheet, reportSent: sentFromSheet } = getReportStatusFromSheet(session);
                              const canSend = fromSheet && session.studentEmail && !isGeneratingReports;
                              if (sentFromSheet) {
                                return (
                                  <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full text-white" style={{ backgroundColor: '#6B7280' }}>
                                    Sent
                                  </span>
                                );
                              }
                              return (
                                <button
                                  type="button"
                                  disabled={!canSend}
                                  onClick={async () => {
                                    if (!session.studentEmail || !session.studentName || !session.date) return;
                                    const sessionDate = parseSessionDate(session.date);
                                    if (!sessionDate) return;
                                    const weekNum = getProgramWeekNumber(sessionDate);
                                    setIsGeneratingReports(true);
                                    setLastReportSummary(null);
                                    setLastReportErrors([]);
                                    try {
                                      const response = await fetch(getApiUrl('api/send-session-report-email'), {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          menteeEmail: session.studentEmail,
                                          menteeName: session.studentName,
                                          weekNumber: weekNum,
                                        }),
                                      });
                                      const result = await response.json();
                                      if (response.ok && result.success) {
                                        setLastReportSummary(result.message || 'Report email sent.');
                                        await handleRefresh();
                                      } else {
                                        setLastReportSummary('Failed to send report email.');
                                        if (result?.error || result?.details) {
                                          setLastReportErrors([result.error || result.details || 'Unknown error sending email']);
                                        }
                                      }
                                    } catch (e: any) {
                                      setLastReportSummary('Failed to send report email.');
                                      setLastReportErrors([e?.message || String(e || 'unknown')]);
                                    } finally {
                                      setIsGeneratingReports(false);
                                    }
                                  }}
                                  className="px-3 py-1 inline-flex text-xs leading-5 font-medium rounded-full border border-[#3A5A5A] text-gray-100 bg-[#F59E0B] hover:bg-[#D97706] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Send
                                </button>
                              );
                            })()}
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
