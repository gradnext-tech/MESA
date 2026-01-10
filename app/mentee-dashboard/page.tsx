'use client';

import React, { useMemo, useState } from 'react';
import { useData } from '@/context/DataContext';
import { calculateMenteeMetrics, getDetailedCandidateAnalytics } from '@/utils/metricsCalculator';
import { MetricCard } from '@/components/MetricCard';
import { DetailModal } from '@/components/DetailModal';
import { CandidateSessionStats } from '@/types';
import {
  Users,
  TrendingUp,
  Star,
  Trophy,
  XCircle,
  AlertCircle,
  Calendar,
  UserPlus,
  Activity,
  Award,
  Search,
  CheckCircle,
} from 'lucide-react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { startOfWeek, endOfWeek, format, parseISO, eachWeekOfInterval, min, max, isWithinInterval, startOfDay } from 'date-fns';

export default function MenteeDashboard() {
  const { sessions, hasData, mentees } = useData();
  const [weekFilter, setWeekFilter] = useState<Date | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMentee, setSelectedMentee] = useState<CandidateSessionStats | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const menteeMetrics = useMemo(() => {
    if (!hasData) return null;
    return calculateMenteeMetrics(sessions, weekFilter, mentees);
  }, [sessions, hasData, weekFilter, mentees]);

  const candidateAnalytics = useMemo(() => {
    if (!hasData) return [];
    return getDetailedCandidateAnalytics(sessions);
  }, [sessions, hasData]);

  const filteredCandidates = useMemo(() => {
    if (!searchTerm) return candidateAnalytics;
    const term = searchTerm.toLowerCase();
    return candidateAnalytics.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term)
    );
  }, [candidateAnalytics, searchTerm]);

  const handleMenteeClick = (candidate: CandidateSessionStats) => {
    setSelectedMentee(candidate);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedMentee(null);
  };

  const menteeSessions = useMemo(() => {
    if (!selectedMentee) return [];
    return sessions.filter(s => s.menteeEmail === selectedMentee.email);
  }, [selectedMentee, sessions]);

  // Prepare chart data
  const performanceData = useMemo(() => {
    if (!menteeMetrics) return [];
    return [
      {
        metric: 'Avg Sessions/Day',
        value: menteeMetrics.avgDailySessions,
      },
      {
        metric: 'Avg Sessions/Candidate',
        value: menteeMetrics.avgSessionsPerCandidateTotal,
      },
      {
        metric: 'Avg Sessions/Active',
        value: menteeMetrics.avgSessionsPerCandidateActive,
      },
      {
        metric: 'Avg Feedback',
        value: menteeMetrics.avgFeedbackScore,
      },
    ];
  }, [menteeMetrics]);

  // Helper function to parse dates consistently
  const parseSessionDate = (dateString: string): Date | null => {
    if (!dateString) return null;
    
    try {
      // Try parseISO first (handles ISO format dates)
      const date = parseISO(dateString);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch {
      // Continue to try Date constructor
    }
    
    try {
      // Try Date constructor (handles various formats)
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch {
      // Return null if both fail
    }
    
    return null;
  };

  // Weekwise Session Booked Data
  const weekwiseSessionData = useMemo(() => {
    if (!hasData || sessions.length === 0) {
      console.log('Weekwise data: No sessions available', { hasData, sessionsLength: sessions.length });
      return [];
    }
    
    // Get all session dates with consistent parsing
    const sessionDates: Date[] = [];
    sessions.forEach(s => {
      if (!s.date) return;
      const parsedDate = parseSessionDate(s.date);
      if (parsedDate) {
        sessionDates.push(parsedDate);
      }
    });
    
    console.log('Weekwise data: Valid dates found', sessionDates.length, 'out of', sessions.length);
    if (sessionDates.length === 0) {
      console.log('Weekwise data: No valid dates found. Sample dates:', sessions.slice(0, 5).map(s => ({ date: s.date, type: typeof s.date })));
      return [];
    }
    
    // Log sample dates for debugging
    console.log('Weekwise data: Sample parsed dates:', sessionDates.slice(0, 3).map(d => d.toISOString()));
    
    // Find date range
    const minDate = min(sessionDates);
    const maxDate = max(sessionDates);
    
    console.log('Weekwise data: Date range', { 
      minDate: minDate.toISOString(), 
      maxDate: maxDate.toISOString(),
      minDateFormatted: format(minDate, 'MMM d, yyyy'),
      maxDateFormatted: format(maxDate, 'MMM d, yyyy')
    });
    
    // Generate all weeks in the range
    const weeks = eachWeekOfInterval(
      { start: minDate, end: maxDate },
      { weekStartsOn: 1 } // Monday
    );
    
    console.log('Weekwise data: Weeks generated', weeks.length);
    console.log('Weekwise data: Week ranges:', weeks.map(w => {
      const we = endOfWeek(w, { weekStartsOn: 1 });
      return `${format(w, 'MMM d')} - ${format(we, 'MMM d')}`;
    }));
    
    // Count sessions per week using the same parsing function
    const weekData = weeks.map(weekStart => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekStartNormalized = startOfDay(weekStart);
      const weekEndNormalized = startOfDay(weekEnd);
      
      const weekSessions = sessions.filter(s => {
        if (!s.date) return false;
        
        const sessionDate = parseSessionDate(s.date);
        if (!sessionDate) return false;
        
        // Normalize session date to start of day for comparison
        const sessionDateNormalized = startOfDay(sessionDate);
        
        // Use isWithinInterval for accurate date comparison
        const isInWeek = isWithinInterval(sessionDateNormalized, {
          start: weekStartNormalized,
          end: weekEndNormalized,
        });
        
        return isInWeek;
      });
      
      console.log(`Week ${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}: Found ${weekSessions.length} sessions`);
      if (weekSessions.length > 0) {
        console.log(`  Sample session dates in this week:`, weekSessions.slice(0, 3).map(s => s.date));
      }
      
      return {
        week: format(weekStart, 'MMM d'),
        weekStart: weekStart.toISOString(),
        sessions: weekSessions.length,
        weekLabel: `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`,
      };
    });
    
    const totalSessions = weekData.reduce((sum, w) => sum + w.sessions, 0);
    console.log('Weekwise data: Final data', weekData.length, 'weeks');
    console.log('Weekwise data: Total sessions across all weeks', totalSessions, 'out of', sessions.length, 'total sessions');
    if (weekData.length > 0) {
      console.log('Weekwise data: Sample weeks', weekData.slice(0, 3));
    }
    
    // Return all weeks (including those with 0 sessions) for complete trend visualization
    return weekData;
  }, [sessions, hasData]);

  // Weekwise Cancellations & No-Shows data for line chart
  const weekwiseDisruptionData = useMemo(() => {
    if (!hasData || sessions.length === 0) return [];
    
    const sessionDates: Date[] = [];
    sessions.forEach(s => {
      const parsedDate = parseSessionDate(s.date);
      if (parsedDate) sessionDates.push(parsedDate);
    });
    
    if (sessionDates.length === 0) return [];
    
    const minDate = min(sessionDates);
    const maxDate = max(sessionDates);
    const weeks = eachWeekOfInterval({ start: minDate, end: maxDate }, { weekStartsOn: 1 });
    
    return weeks.map(weekStart => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekStartNormalized = startOfDay(weekStart);
      const weekEndNormalized = startOfDay(weekEnd);
      
      const weekSessions = sessions.filter(s => {
        const sessionDate = parseSessionDate(s.date);
        if (!sessionDate) return false;
        const sessionDateNormalized = startOfDay(sessionDate);
        return isWithinInterval(sessionDateNormalized, {
          start: weekStartNormalized,
          end: weekEndNormalized,
        });
      });
      
      const cancelled = weekSessions.filter(s => {
        const status = (s.sessionStatus || '').toLowerCase().trim();
        return status === 'cancelled';
      }).length;
      
      const noShow = weekSessions.filter(s => {
        const status = (s.sessionStatus || '').toLowerCase().trim();
        return status === 'mentee no show' || status === 'candidate no show' || status === 'menteenoshow' || status === 'candidatenoshow';
      }).length;
      
      return {
        week: format(weekStart, 'MMM d'),
        weekStart: weekStart.toISOString(),
        cancelled,
        noShow,
        weekLabel: `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`,
      };
    });
  }, [sessions, hasData]);

  const disruptionData = useMemo(() => {
    if (!menteeMetrics) return [];
    return [
      {
        category: 'Sessions',
        Cancelled: menteeMetrics.totalSessionsCancelled,
        NoShow: menteeMetrics.totalNoShows,
      },
      {
        category: 'Candidates',
        Cancelled: menteeMetrics.candidatesCancelled,
        NoShow: menteeMetrics.candidatesNoShow,
      },
    ];
  }, [menteeMetrics]);

  if (!hasData || !menteeMetrics) {
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
          <h1 className="text-3xl font-bold text-white">Mentee Dashboard</h1>
          <p className="text-gray-300 mt-1">
            Comprehensive analytics for mentee engagement and performance
          </p>
        </div>
      </div>

      {/* Primary Metrics - Improved Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Sessions Done"
          value={menteeMetrics.totalSessionsDone}
          icon={Calendar}
          iconColor="text-[#22C55E]"
          subtitle="Completed sessions"
        />
        <MetricCard
          title="Candidates Booking"
          value={menteeMetrics.candidatesBooking}
          icon={Users}
          iconColor="text-[#22C55E]"
          subtitle="Unique candidates"
        />
        <MetricCard
          title="First Time Candidates"
          value={menteeMetrics.firstTimeCandidates}
          icon={UserPlus}
          iconColor="text-[#22C55E]"
          subtitle="New this period"
        />
        <MetricCard
          title="Avg Feedback Score"
          value={menteeMetrics.avgFeedbackScore > 0 ? menteeMetrics.avgFeedbackScore.toFixed(2) : 'N/A'}
          icon={Star}
          iconColor="text-[#22C55E]"
          subtitle="Overall average"
        />
      </div>

      {/* Session Averages - Compact Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MetricCard
          title="Avg Daily Sessions"
          value={menteeMetrics.avgDailySessions.toFixed(1)}
          icon={TrendingUp}
          iconColor="text-[#22C55E]"
          subtitle="Per day average"
        />
        <MetricCard
          title="Avg Sessions (Active)"
          value={menteeMetrics.avgSessionsPerCandidateActive.toFixed(1)}
          icon={Activity}
          iconColor="text-[#22C55E]"
          subtitle="Candidates with ≥1 session"
        />
      </div>

      {/* Weekly Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MetricCard
          title="Avg Sessions Per Week"
          value={menteeMetrics.avgSessionsPerWeek > 0 ? menteeMetrics.avgSessionsPerWeek.toFixed(1) : 'N/A'}
          icon={Calendar}
          iconColor="text-[#22C55E]"
          subtitle={menteeMetrics.avgSessionsPerWeek > 0 ? "Weekly average" : "No sessions available"}
        />
        <MetricCard
          title="Avg Rating Per Week"
          value={menteeMetrics.avgRatingPerWeek > 0 ? menteeMetrics.avgRatingPerWeek.toFixed(2) : 'N/A'}
          icon={Star}
          iconColor="text-[#22C55E]"
          subtitle="Weekly average rating"
        />
      </div>

      {/* Top Performers - Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top 10% by Sessions */}
        <div className="rounded-xl shadow-md p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)' }}>
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Top 10% by Sessions</h3>
              <p className="text-xs text-gray-400">Candidates with most sessions</p>
            </div>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {menteeMetrics.top10BySessions.length === 0 ? (
              <p className="text-gray-400 text-sm">No candidates found</p>
            ) : (
              menteeMetrics.top10BySessions.map((candidate, index) => (
                <div
                  key={candidate.email}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-[#1A3636] cursor-pointer transition-colors"
                  onClick={() => handleMenteeClick(candidate)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-[#22C55E] w-6">#{index + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-white">{candidate.name || candidate.email}</p>
                      <p className="text-xs text-gray-400">{candidate.totalSessionsBooked} sessions</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top 10% by Rating */}
        <div className="rounded-xl shadow-md p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)' }}>
              <Award className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Top 10% by Rating</h3>
              <p className="text-xs text-gray-400">Highest rated candidates</p>
            </div>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {menteeMetrics.top10ByRating.length === 0 ? (
              <p className="text-gray-400 text-sm">No candidates found</p>
            ) : (
              menteeMetrics.top10ByRating.map((candidate, index) => (
                <div
                  key={candidate.email}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-[#1A3636] cursor-pointer transition-colors"
                  onClick={() => handleMenteeClick(candidate)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-[#22C55E] w-6">#{index + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-white">{candidate.name || candidate.email}</p>
                      <div className="flex items-center gap-2">
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                        <p className="text-xs text-gray-400">{candidate.avgFeedback.toFixed(2)} rating</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Performers & No Sessions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Bottom 10% Feedback */}
        <div className="rounded-xl shadow-md p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            <div>
              <h3 className="text-lg font-semibold text-white">Bottom 10% Feedback</h3>
              <p className="text-xs text-gray-400">Lowest feedback scores</p>
            </div>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {menteeMetrics.bottom10Feedback.length === 0 ? (
              <p className="text-gray-400 text-sm">No candidates found</p>
            ) : (
              menteeMetrics.bottom10Feedback.map((candidate, index) => (
                <div
                  key={candidate.email}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-[#1A3636] cursor-pointer transition-colors"
                  onClick={() => handleMenteeClick(candidate)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-orange-500 w-6">#{index + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-white">{candidate.name || candidate.email}</p>
                      <p className="text-xs text-gray-400">{candidate.avgFeedback.toFixed(2)} rating</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bottom 25% Feedback */}
        <div className="rounded-xl shadow-md p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-5 h-5 text-orange-400" />
            <div>
              <h3 className="text-lg font-semibold text-white">Bottom 25% Feedback</h3>
              <p className="text-xs text-gray-400">Lower feedback scores</p>
            </div>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {menteeMetrics.bottom25Feedback.length === 0 ? (
              <p className="text-gray-400 text-sm">No candidates found</p>
            ) : (
              menteeMetrics.bottom25Feedback.map((candidate, index) => (
                <div
                  key={candidate.email}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-[#1A3636] cursor-pointer transition-colors"
                  onClick={() => handleMenteeClick(candidate)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-orange-400 w-6">#{index + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-white">{candidate.name || candidate.email}</p>
                      <p className="text-xs text-gray-400">{candidate.avgFeedback.toFixed(2)} rating</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Candidates No Sessions */}
        <div className="rounded-xl shadow-md p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <div className="flex items-center gap-3 mb-4">
            <XCircle className="w-5 h-5 text-red-400" />
            <div>
              <h3 className="text-lg font-semibold text-white">Candidates No Sessions</h3>
              <p className="text-xs text-gray-400">{menteeMetrics.candidatesNoSessions.length} candidates</p>
            </div>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {menteeMetrics.candidatesNoSessions.length === 0 ? (
              <p className="text-gray-400 text-sm">All candidates have sessions</p>
            ) : (
              menteeMetrics.candidatesNoSessions.map((mentee, index) => (
                <div
                  key={mentee.email}
                  className="p-2 rounded-lg hover:bg-[#1A3636] transition-colors"
                >
                  <p className="text-sm font-medium text-white">{mentee.name || mentee.email}</p>
                  <p className="text-xs text-gray-400">{mentee.email}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Metrics Bar Chart */}
        <div className="rounded-xl shadow-md p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <h3 className="text-lg font-semibold text-white mb-4">
            Performance Metrics Overview
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3A5A5A" />
              <XAxis dataKey="metric" stroke="#86EFAC" fontSize={12} tick={{ fill: '#86EFAC' }} />
              <YAxis stroke="#86EFAC" tick={{ fill: '#86EFAC' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#2A4A4A',
                  border: '1px solid #3A5A5A',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Bar dataKey="value" fill="#22C55E" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Cancellations & No-Shows - Interactive Line Chart */}
        <div className="rounded-xl shadow-md p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Cancellations & No-Shows</h3>
              <p className="text-xs text-gray-400 mt-1">Weekly trend analysis</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-gray-300">Cancelled</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <span className="text-gray-300">No-Show</span>
              </div>
            </div>
          </div>
          {weekwiseDisruptionData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px]">
              <p className="text-gray-400">No disruption data available</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={weekwiseDisruptionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3A5A5A" opacity={0.3} />
                <XAxis 
                  dataKey="week" 
                  stroke="#86EFAC" 
                  tick={{ fill: '#86EFAC', fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis stroke="#86EFAC" tick={{ fill: '#86EFAC', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1A3636',
                    border: '1px solid #3A5A5A',
                    borderRadius: '8px',
                    color: '#fff',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                  }}
                  labelFormatter={(label) => {
                    const data = weekwiseDisruptionData.find(d => d.week === label);
                    return data ? data.weekLabel : label;
                  }}
                />
                <Legend 
                  wrapperStyle={{ paddingTop: '10px' }}
                  iconType="line"
                />
                <Line
                  type="monotone"
                  dataKey="cancelled"
                  stroke="#ef4444"
                  strokeWidth={2.5}
                  dot={{ fill: '#ef4444', r: 4, strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }}
                  name="Cancelled"
                />
                <Line
                  type="monotone"
                  dataKey="noShow"
                  stroke="#f97316"
                  strokeWidth={2.5}
                  dot={{ fill: '#f97316', r: 4, strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, fill: '#f97316', strokeWidth: 2, stroke: '#fff' }}
                  name="No-Show"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Weekwise Session Booked Line Chart - Full Width */}
      <div className="rounded-xl shadow-md p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
        <h3 className="text-lg font-semibold text-white mb-4">
          Weekwise Sessions Booked
        </h3>
        {weekwiseSessionData.length === 0 ? (
          <div className="flex items-center justify-center h-[300px]">
            <p className="text-gray-400">No session data available</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={weekwiseSessionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3A5A5A" />
              <XAxis 
                dataKey="week" 
                stroke="#86EFAC" 
                tick={{ fill: '#86EFAC', fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis stroke="#86EFAC" tick={{ fill: '#86EFAC' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#2A4A4A',
                  border: '1px solid #3A5A5A',
                  borderRadius: '8px',
                  color: '#fff',
                }}
                labelFormatter={(label) => {
                  const data = weekwiseSessionData.find(d => d.week === label);
                  return data ? data.weekLabel : label;
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="sessions"
                stroke="#22C55E"
                strokeWidth={3}
                dot={{ fill: '#22C55E', r: 5 }}
                activeDot={{ r: 7, fill: '#16A34A' }}
                name="Sessions Booked"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Cancellations & No-Shows Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Sessions Cancelled"
          value={menteeMetrics.totalSessionsCancelled}
          icon={XCircle}
          iconColor="text-red-500"
          subtitle="Total cancellations"
        />
        <MetricCard
          title="Total No-Shows"
          value={menteeMetrics.totalNoShows}
          icon={AlertCircle}
          iconColor="text-orange-500"
          subtitle="Missed sessions"
        />
        <MetricCard
          title="Candidates Cancelled"
          value={menteeMetrics.candidatesCancelled}
          icon={Users}
          iconColor="text-red-400"
          subtitle="Unique candidates"
        />
        <MetricCard
          title="Candidates No-Show"
          value={menteeMetrics.candidatesNoShow}
          icon={Users}
          iconColor="text-orange-400"
          subtitle="Unique candidates"
        />
      </div>

      {/* Individual Mentee Analytics Table */}
      <div className="rounded-xl shadow-md border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
        <div className="p-6 border-b" style={{ borderColor: '#3A5A5A' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Individual Mentee Analytics</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search mentees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent"
                style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A', color: '#fff' }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#22C55E'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#3A5A5A'}
              />
            </div>
          </div>
          <p className="text-gray-300">
            Detailed analytics for {filteredCandidates.length} mentees
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b" style={{ backgroundColor: '#1A3636', borderColor: '#3A5A5A' }}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Mentee Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sessions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Completion Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg Feedback
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mentors Worked With
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Disruptions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ backgroundColor: '#2A4A4A' }}>
              {filteredCandidates.map((candidate, index) => (
                <tr
                  key={index}
                  className="transition-colors cursor-pointer"
                  style={{ borderColor: '#3A5A5A' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1A3636'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2A4A4A'}
                  onClick={() => handleMenteeClick(candidate)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-white">
                        {candidate.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {candidate.email}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-white">
                        {candidate.completedSessions} completed
                      </span>
                      <span className="text-xs text-gray-400">
                        {candidate.totalSessionsBooked} total booked
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <div className="w-16 rounded-full h-2 mr-2" style={{ backgroundColor: '#1A3636' }}>
                            <div
                              className="h-2 rounded-full"
                              style={{
                                width: `${Math.min(candidate.completionRate, 100)}%`,
                                backgroundColor: '#22C55E',
                              }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium text-white">
                            {candidate.completionRate.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Star className="w-4 h-4 mr-1" style={{ color: '#86EFAC' }} />
                      <span className="text-sm text-white">
                        {candidate.avgFeedback > 0 ? candidate.avgFeedback.toFixed(2) : 'N/A'}
                      </span>
                      {candidate.feedbackCount > 0 && (
                        <span className="text-xs text-gray-400 ml-1">
                          ({candidate.feedbackCount})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full" style={{ backgroundColor: '#22C55E', color: '#fff' }}>
                      {candidate.uniqueMentors}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      {candidate.sessionsCancelled > 0 && (
                        <span className="text-xs text-red-400">
                          {candidate.sessionsCancelled} cancelled
                        </span>
                      )}
                      {candidate.sessionsNoShow > 0 && (
                        <span className="text-xs text-orange-400">
                          {candidate.sessionsNoShow} no-show
                        </span>
                      )}
                      {candidate.sessionsCancelled === 0 && candidate.sessionsNoShow === 0 && (
                        <span className="text-xs flex items-center" style={{ color: '#86EFAC' }}>
                          <CheckCircle className="w-3 h-3 mr-1" />
                          None
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-400">
                        {candidate.firstSessionDate}
                      </span>
                      <span className="text-xs text-gray-400">
                        to {candidate.lastSessionDate}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredCandidates.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-300">No mentees found matching your search.</p>
          </div>
        )}
      </div>

      {/* Insights Section */}
      <div className="rounded-xl p-6 border" style={{ background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(134, 239, 172, 0.1) 100%)', borderColor: '#22C55E' }}>
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
          <TrendingUp className="w-5 h-5 mr-2" style={{ color: '#22C55E' }} />
          Key Insights
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg p-4" style={{ backgroundColor: 'rgba(42, 74, 74, 0.6)' }}>
            <p className="font-medium text-white mb-1">Engagement Rate</p>
            <p className="text-gray-300">
              {menteeMetrics.candidatesBooking > 0
                ? (
                    (menteeMetrics.totalSessionsDone /
                      menteeMetrics.candidatesBooking) *
                    100
                  ).toFixed(1)
                : 0}
              % of candidates completed sessions
            </p>
          </div>
          <div className="rounded-lg p-4" style={{ backgroundColor: 'rgba(42, 74, 74, 0.6)' }}>
            <p className="font-medium text-white mb-1">Completion Rate</p>
            <p className="text-gray-300">
              {menteeMetrics.totalSessionsDone +
                menteeMetrics.totalSessionsCancelled +
                menteeMetrics.totalNoShows >
              0
                ? (
                    (menteeMetrics.totalSessionsDone /
                      (menteeMetrics.totalSessionsDone +
                        menteeMetrics.totalSessionsCancelled +
                        menteeMetrics.totalNoShows)) *
                    100
                  ).toFixed(1)
                : 0}
              % of booked sessions completed
            </p>
          </div>
          <div className="rounded-lg p-4" style={{ backgroundColor: 'rgba(42, 74, 74, 0.6)' }}>
            <p className="font-medium text-white mb-1">Disruption Rate</p>
            <p className="text-gray-300">
              {menteeMetrics.totalSessionsDone > 0
                ? (
                    ((menteeMetrics.totalSessionsCancelled +
                      menteeMetrics.totalNoShows) /
                      menteeMetrics.totalSessionsDone) *
                    100
                  ).toFixed(1)
                : 0}
              % cancellations/no-shows
            </p>
          </div>
          <div className="rounded-lg p-4" style={{ backgroundColor: 'rgba(42, 74, 74, 0.6)' }}>
            <p className="font-medium text-white mb-1">Retention Insight</p>
            <p className="text-gray-300">
              {menteeMetrics.candidatesBooking > 0
                ? (
                    ((menteeMetrics.candidatesBooking -
                      menteeMetrics.firstTimeCandidates) /
                      menteeMetrics.candidatesBooking) *
                    100
                  ).toFixed(1)
                : 0}
              % are returning candidates
            </p>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedMentee && (
        <DetailModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          type="mentee"
          name={selectedMentee.name}
          email={selectedMentee.email}
          phone={sessions.find(s => s.menteeEmail === selectedMentee.email)?.menteePhone}
          sessions={menteeSessions}
        />
      )}
    </div>
  );
}

