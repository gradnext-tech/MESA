'use client';

import React, { useMemo, useState } from 'react';
import { useData } from '@/context/DataContext';
import { calculateMentorMetrics, calculateMentorSessionStats } from '@/utils/metricsCalculator';
import { MetricCard } from '@/components/MetricCard';
import { DetailModal } from '@/components/DetailModal';
import { MentorMetrics } from '@/types';
import {
  Star,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  MessageSquare,
  TrendingUp,
  Search,
  Filter,
} from 'lucide-react';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from 'date-fns';
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
} from 'recharts';

// Helper function to convert Date to week input value (YYYY-Www format, ISO week)
// HTML5 week input uses ISO 8601 week format
function getWeekInputValue(date: Date): string {
  // Use date-fns to get ISO week
  const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday
  const year = weekStart.getFullYear();
  
  // Calculate ISO week number
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7; // Convert Sunday (0) to 7
  const daysToMonday = (8 - jan4Day) % 7;
  const firstMonday = new Date(year, 0, 4 + daysToMonday);
  const weekNum = Math.ceil(((+weekStart - +firstMonday) / 86400000 + 1) / 7);
  
  return `${year}-W${weekNum.toString().padStart(2, '0')}`;
}

// Helper function to get date from year and week number (ISO week format)
function getDateFromWeek(year: number, week: number): Date {
  // Calculate the date for the Monday of the given ISO week
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7; // Convert Sunday (0) to 7
  const daysToMonday = (8 - jan4Day) % 7;
  const firstMonday = new Date(year, 0, 4 + daysToMonday);
  const weekStart = new Date(firstMonday);
  weekStart.setDate(firstMonday.getDate() + (week - 1) * 7);
  return weekStart;
}

export default function MentorDashboard() {
  const { sessions, hasData, setSessions } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMentor, setSelectedMentor] = useState<MentorMetrics | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [weekFilter, setWeekFilter] = useState<Date | undefined>(undefined);
  const [monthFilter, setMonthFilter] = useState<string>(''); // Format: YYYY-MM
  const [selectedMentorFilter, setSelectedMentorFilter] = useState<string>('');

  // Auto-fetch data if not available (when navigating directly to this page)
  React.useEffect(() => {
    if (!hasData) {
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
            const { parseSpreadsheetData } = await import('@/utils/metricsCalculator');
            const parsedSessions = parseSpreadsheetData(
              result.data.sessions,
              result.data.mentorFeedbacks || [],
              result.data.candidateFeedbacks || []
            );
            setSessions(parsedSessions);
          }
        } catch (error) {
          console.warn('Auto-connect error in mentor dashboard:', error);
        }
      };

      autoConnect();
    }
  }, [hasData]);

  // Debug logging
  React.useEffect(() => {
    console.log('Mentor Dashboard - sessions count:', sessions.length);
    console.log('Mentor Dashboard - hasData:', hasData);
    if (sessions.length > 0) {
      console.log('Mentor Dashboard - first session:', sessions[0]);
      console.log('Mentor Dashboard - sessions with mentorEmail:', sessions.filter(s => s.mentorEmail).length);
    }
  }, [sessions, hasData]);

  const mentorMetrics = useMemo(() => {
    if (!hasData) {
      console.log('Mentor Dashboard - No data, returning empty array');
      return [];
    }
    const metrics = calculateMentorMetrics(sessions);
    console.log('Mentor Dashboard - Calculated metrics:', metrics.length);
    return metrics;
  }, [sessions, hasData]);

  const filteredMentors = useMemo(() => {
    if (!searchTerm) return mentorMetrics;
    const term = searchTerm.toLowerCase();
    return mentorMetrics.filter(
      (m) =>
        m.mentorName.toLowerCase().includes(term) ||
        m.mentorEmail.toLowerCase().includes(term)
    );
  }, [mentorMetrics, searchTerm]);

  const handleMentorClick = (mentor: MentorMetrics) => {
    setSelectedMentor(mentor);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedMentor(null);
  };

  const mentorSessions = useMemo(() => {
    if (!selectedMentor) return [];
    return sessions.filter(s => s.mentorEmail === selectedMentor.mentorEmail);
  }, [selectedMentor, sessions]);

  // Aggregate metrics
  const aggregateMetrics = useMemo(() => {
    if (mentorMetrics.length === 0) {
      return {
        totalMentors: 0,
        avgRating: 0,
        totalSessions: 0,
        totalCancelled: 0,
        totalNoShow: 0,
        totalRescheduled: 0,
        totalFeedbacksNotFilled: 0,
      };
    }

    return {
      totalMentors: mentorMetrics.length,
      avgRating:
        mentorMetrics.reduce((sum, m) => sum + m.avgRating, 0) /
        mentorMetrics.length,
      totalSessions: mentorMetrics.reduce((sum, m) => sum + m.sessionsDone, 0),
      totalCancelled: mentorMetrics.reduce(
        (sum, m) => sum + m.sessionsCancelled,
        0
      ),
      totalNoShow: mentorMetrics.reduce((sum, m) => sum + m.sessionsNoShow, 0),
      totalRescheduled: mentorMetrics.reduce(
        (sum, m) => sum + m.sessionsRescheduled,
        0
      ),
      totalFeedbacksNotFilled: mentorMetrics.reduce(
        (sum, m) => sum + m.feedbacksFilled, // feedbacksFilled now stores "not filled" count
        0
      ),
    };
  }, [mentorMetrics]);

  // Chart data
  const topMentorsData = useMemo(() => {
    return [...mentorMetrics]
      .sort((a, b) => b.sessionsDone - a.sessionsDone)
      .slice(0, 10)
      .map((m) => ({
        name: m.mentorName.split(' ')[0],
        sessions: m.sessionsDone,
        rating: m.avgRating,
      }));
  }, [mentorMetrics]);

  // Top 10 mentors by rating
  const topMentorsByRating = useMemo(() => {
    return [...mentorMetrics]
      .filter(m => m.avgRating > 0) // Only include mentors with ratings
      .sort((a, b) => b.avgRating - a.avgRating)
      .slice(0, 10);
  }, [mentorMetrics]);

  // Get unique mentors for filter dropdown
  const uniqueMentors = useMemo(() => {
    const mentors = new Set<string>();
    sessions.forEach(s => {
      if (s.mentorEmail) {
        mentors.add(s.mentorEmail);
      }
    });
    return Array.from(mentors).sort().map(email => {
      const session = sessions.find(s => s.mentorEmail === email);
      return {
        email,
        name: session?.mentorName || email,
      };
    });
  }, [sessions]);

  // Calculate mentor session statistics with filters
  const mentorSessionStats = useMemo(() => {
    if (!hasData) return [];
    console.log('Calculating mentorSessionStats with filters:', {
      sessionsCount: sessions.length,
      weekFilter: weekFilter?.toISOString(),
      monthFilter,
      selectedMentorFilter
    });
    return calculateMentorSessionStats(sessions, weekFilter, monthFilter || undefined, selectedMentorFilter || undefined);
  }, [sessions, hasData, weekFilter, monthFilter, selectedMentorFilter]);

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
          <h1 className="text-3xl font-bold text-white">Mentor Dashboard</h1>
          <p className="text-gray-300 mt-1">
            Performance metrics for {aggregateMetrics.totalMentors} mentors
          </p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Average Rating"
          value={aggregateMetrics.avgRating > 0 ? aggregateMetrics.avgRating.toFixed(2) : 'N/A'}
          icon={Star}
          iconColor="text-[#22C55E]"
          subtitle="Across all mentors"
        />
        <MetricCard
          title="Total Sessions"
          value={aggregateMetrics.totalSessions}
          icon={CheckCircle}
          iconColor="text-[#22C55E]"
          subtitle="Completed sessions"
        />
        <MetricCard
          title="Cancelled/No-Show"
          value={aggregateMetrics.totalCancelled + aggregateMetrics.totalNoShow}
          icon={XCircle}
          iconColor="text-red-400"
          subtitle="Total disruptions"
        />
        <MetricCard
          title="Feedbacks Not Filled"
          value={aggregateMetrics.totalFeedbacksNotFilled}
          icon={MessageSquare}
          iconColor="text-yellow-400"
          subtitle="Completed sessions without feedback"
        />
      </div>

      {/* Top Mentors by Rating - Horizontal Bar Chart Style */}
      <div className="rounded-xl shadow-lg border overflow-hidden" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
        <div className="p-6 border-b" style={{ backgroundColor: '#1A3636', borderColor: '#3A5A5A' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)' }}>
              <Star className="w-6 h-6 text-white" fill="white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Top 10 Mentors by Rating</h3>
              <p className="text-xs text-gray-400 mt-1">Visual ranking based on average session ratings</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          {topMentorsByRating.length === 0 ? (
            <div className="text-center py-12">
              <Star className="w-12 h-12 mx-auto mb-3 text-gray-500 opacity-50" />
              <p className="text-gray-400">No mentors with ratings available</p>
            </div>
          ) : (
            <div className="space-y-4">
              {topMentorsByRating.map((mentor, index) => {
                const isTopThree = index < 3;
                const maxRating = topMentorsByRating[0]?.avgRating || 5;
                const ratingPercentage = (mentor.avgRating / maxRating) * 100;
                const barColors = ['#FFD700', '#C0C0C0', '#CD7F32', '#22C55E'];
                const barColor = isTopThree ? barColors[index] : barColors[3];
                
                return (
                  <div
                    key={mentor.mentorEmail}
                    className="group"
                  >
                    <div className="flex items-center gap-4">
                      {/* Rank & Medal */}
                      <div className="flex-shrink-0 w-16 flex flex-col items-center">
                        {isTopThree ? (
                          <div className="text-3xl mb-1">
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                          </div>
                        ) : (
                          <div 
                            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm mb-1"
                            style={{ backgroundColor: '#3A5A5A', color: '#86EFAC' }}
                          >
                            {index + 1}
                          </div>
                        )}
                        <div className="text-xs text-gray-400 font-medium">#{index + 1}</div>
                      </div>

                      {/* Mentor Info */}
                      <div className="flex-shrink-0 w-48">
                        <h4 className="text-sm font-semibold text-white truncate">
                          {mentor.mentorName}
                        </h4>
                        <p className="text-xs text-gray-400 truncate">
                          {mentor.mentorEmail}
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-xs text-gray-500">{mentor.sessionsDone} sessions</span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="flex-1 relative">
                        <div className="relative h-12 rounded-lg overflow-hidden" style={{ backgroundColor: '#1A3636' }}>
                          {/* Background gradient */}
                          <div 
                            className="absolute inset-0 rounded-lg transition-all duration-500 group-hover:brightness-110"
                            style={{
                              width: `${ratingPercentage}%`,
                              background: `linear-gradient(90deg, ${barColor} 0%, ${barColor}dd 100%)`,
                              boxShadow: `0 0 20px ${barColor}40`
                            }}
                          />
                          
                          {/* Rating text overlay */}
                          <div className="absolute inset-0 flex items-center justify-between px-4">
                            <div className="flex items-center gap-2">
                              <Star className="w-4 h-4" style={{ color: '#FFD700' }} fill="#FFD700" />
                              <span className="text-lg font-bold text-white">
                                {mentor.avgRating.toFixed(2)}
                              </span>
                            </div>
                            
                            {/* Star rating visualization */}
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`w-3 h-3 ${
                                    star <= Math.round(mentor.avgRating)
                                      ? 'text-yellow-400'
                                      : 'text-gray-600'
                                  }`}
                                  fill={star <= Math.round(mentor.avgRating) ? '#FACC15' : 'none'}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6">
        {/* Top Mentors Bar Chart */}
        <div className="rounded-xl shadow-md p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <h3 className="text-lg font-semibold text-white mb-4">
            Top 10 Mentors by Sessions
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topMentorsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3A5A5A" />
              <XAxis dataKey="name" stroke="#86EFAC" tick={{ fill: '#86EFAC' }} />
              <YAxis stroke="#86EFAC" tick={{ fill: '#86EFAC' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#2A4A4A',
                  border: '1px solid #3A5A5A',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Legend />
              <Bar dataKey="sessions" fill="#22C55E" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        </div>

      {/* Mentor Session Statistics Table */}
      <div className="rounded-xl shadow-md border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
        <div className="p-6 border-b" style={{ borderColor: '#3A5A5A' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Mentor Session Statistics</h3>
            <div className="flex items-center gap-4">
              {/* Week Filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <label className="text-sm text-gray-300 whitespace-nowrap">Week:</label>
                <input
                  type="week"
                  value={weekFilter ? getWeekInputValue(weekFilter) : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      // Parse week input (format: YYYY-Www)
                      const [year, week] = e.target.value.split('-W');
                      const date = getDateFromWeek(parseInt(year), parseInt(week));
                      setWeekFilter(date);
                      // Clear month filter when week is selected
                      setMonthFilter('');
                    } else {
                      setWeekFilter(undefined);
                    }
                  }}
                  className="px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent text-sm"
                  style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A', color: '#fff' }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#22C55E'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#3A5A5A'}
                />
                {weekFilter && (
                  <>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      ({format(startOfWeek(weekFilter, { weekStartsOn: 1 }), 'MMM d')} - {format(endOfWeek(weekFilter, { weekStartsOn: 1 }), 'MMM d, yyyy')})
                    </span>
                    <button
                      onClick={() => setWeekFilter(undefined)}
                      className="text-xs text-gray-400 hover:text-white px-2"
                      title="Clear week filter"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
              {/* Month Filter */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-300 whitespace-nowrap">Month:</label>
                <input
                  type="month"
                  value={monthFilter}
                  onChange={(e) => {
                    if (e.target.value) {
                      setMonthFilter(e.target.value);
                      // Clear week filter when month is selected
                      setWeekFilter(undefined);
                    } else {
                      setMonthFilter('');
                    }
                  }}
                  className="px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent text-sm"
                  style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A', color: '#fff' }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#22C55E'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#3A5A5A'}
                />
                {monthFilter && (
                  <>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      ({format(new Date(monthFilter + '-01'), 'MMM yyyy')})
                    </span>
                    <button
                      onClick={() => setMonthFilter('')}
                      className="text-xs text-gray-400 hover:text-white px-2"
                      title="Clear month filter"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
              {/* Mentor Filter */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedMentorFilter}
                  onChange={(e) => setSelectedMentorFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent text-sm"
                  style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A', color: '#fff', minWidth: '200px' }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#22C55E'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#3A5A5A'}
                >
                  <option value="">All Mentors</option>
                  {uniqueMentors.map((mentor) => (
                    <option key={mentor.email} value={mentor.email}>
                      {mentor.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
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
                  Total Scheduled
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Completed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Cancelled
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Mentor No Show
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Rescheduled
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Pending
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Avg. Rating
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Feedbacks Not Filled
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ backgroundColor: '#2A4A4A' }}>
              {mentorSessionStats.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-gray-400">
                    No data available for the selected filters
                  </td>
                </tr>
              ) : (
                mentorSessionStats.map((stat) => (
                  <tr
                    key={`${stat.mentorEmail}-${stat.mentorName}`}
                    className="transition-colors"
                    style={{ borderColor: '#3A5A5A' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1A3636'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2A4A4A'}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-white">
                          {stat.mentorName}
                        </span>
                        <span className="text-xs text-gray-400">
                          {stat.mentorEmail}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold text-white">
                        {stat.totalScheduled}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full" style={{ backgroundColor: '#22C55E', color: '#fff' }}>
                        {stat.completed}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-red-400">
                        {stat.cancelled}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-orange-400">
                        {stat.mentorNoShow}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-yellow-400">
                        {stat.rescheduled}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-400">
                        {stat.pending}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Star className="w-4 h-4 mr-1" style={{ color: '#86EFAC' }} />
                        <span className="text-sm text-white">
                          {stat.avgRating > 0 ? stat.avgRating.toFixed(2) : 'N/A'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {stat.feedbacksNotFilled}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedMentor && (
        <DetailModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          type="mentor"
          name={selectedMentor.mentorName}
          email={selectedMentor.mentorEmail}
          sessions={mentorSessions}
        />
      )}
    </div>
  );
}

