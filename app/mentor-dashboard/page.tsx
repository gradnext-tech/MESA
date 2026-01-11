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
  RefreshCw,
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

// Multi-select component for mentors
const MentorMultiSelect: React.FC<{
  mentors: Array<{ email: string; name: string }>;
  selectedMentors: string[];
  onChange: (selected: string[]) => void;
}> = ({ mentors, selectedMentors, onChange }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = (email: string) => {
    if (selectedMentors.includes(email)) {
      onChange(selectedMentors.filter(e => e !== email));
    } else {
      onChange([...selectedMentors, email]);
    }
  };

  const handleSelectAll = () => {
    onChange([]);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        className="px-3 py-2 border rounded-lg text-sm cursor-pointer flex items-center justify-between min-w-[200px]"
        style={{ backgroundColor: '#2A4A4A', borderColor: isOpen ? '#22C55E' : '#3A5A5A', color: '#fff' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-sm">
          {selectedMentors.length === 0 
            ? 'All Mentors' 
            : selectedMentors.length === 1
            ? mentors.find(m => m.email === selectedMentors[0])?.name || '1 mentor'
            : `${selectedMentors.length} mentors`}
        </span>
        <span className="text-gray-400">▼</span>
      </div>
      {isOpen && (
        <div
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto border rounded-lg shadow-lg"
          style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}
        >
          <div className="p-2 border-b" style={{ borderColor: '#3A5A5A' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-300">Select Mentors</span>
              {selectedMentors.length > 0 && (
                <button
                  onClick={handleSelectAll}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Clear All
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 p-1 hover:bg-[#1A3636] rounded cursor-pointer">
              <input
                type="checkbox"
                checked={selectedMentors.length === 0}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded"
                style={{ accentColor: '#22C55E' }}
              />
              <span className="text-sm text-white">All Mentors</span>
            </label>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {mentors.map((mentor) => (
              <label
                key={mentor.email}
                className="flex items-center gap-2 p-2 hover:bg-[#1A3636] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedMentors.includes(mentor.email)}
                  onChange={() => handleToggle(mentor.email)}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: '#22C55E' }}
                />
                <div className="flex-1">
                  <span className="text-sm text-white">{mentor.name}</span>
                  <p className="text-xs text-gray-400 truncate">{mentor.email}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
      {selectedMentors.length > 0 && (
        <button
          onClick={() => onChange([])}
          className="ml-2 text-xs text-gray-400 hover:text-white px-2"
          title="Clear mentor filter"
        >
          ✕
        </button>
      )}
    </div>
  );
};

// Helper function to convert Date to week input value (YYYY-Www format, ISO week)
// HTML5 week input uses ISO 8601 week format
function getWeekInputValue(date: Date): string {
  // Use date-fns to get ISO week
  const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday
  const year = weekStart.getFullYear();
  
  // Calculate ISO 8601 week number
  // ISO week: week 1 is the week containing Jan 4
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7; // Convert Sunday (0) to 7
  
  // Find the Monday of week 1 (same logic as getDateFromWeek)
  // Calculate days to go back to get to Monday
  const daysToMonday = (jan4Day === 1) ? 0 : (jan4Day - 1);
  const firstMonday = new Date(year, 0, 4 - daysToMonday);
  
  // Calculate week number
  const diffInDays = Math.floor((weekStart.getTime() - firstMonday.getTime()) / (1000 * 60 * 60 * 24));
  const weekNum = Math.floor(diffInDays / 7) + 1;
  
  // Handle edge case: if week is 0 or negative, it belongs to previous year
  if (weekNum < 1) {
    const prevYear = year - 1;
    const prevJan4 = new Date(prevYear, 0, 4);
    const prevJan4Day = prevJan4.getDay() || 7;
    const prevDaysToMonday = (prevJan4Day === 1) ? 0 : (prevJan4Day - 1);
    const prevFirstMonday = new Date(prevYear, 0, 4 - prevDaysToMonday);
    const prevDiffInDays = Math.floor((weekStart.getTime() - prevFirstMonday.getTime()) / (1000 * 60 * 60 * 24));
    const prevWeekNum = Math.floor(prevDiffInDays / 7) + 1;
    return `${prevYear}-W${prevWeekNum.toString().padStart(2, '0')}`;
  }
  
  return `${year}-W${weekNum.toString().padStart(2, '0')}`;
}

// Helper function to get date from year and week number (ISO week format)
function getDateFromWeek(year: number, week: number): Date {
  // ISO 8601 week: week 1 is the week containing Jan 4
  // Calculate the first Thursday of the year (which is always in week 1)
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7; // Convert Sunday (0) to 7
  
  // Find the Monday of week 1
  // If Jan 4 is Monday (1), daysToMonday = 0
  // If Jan 4 is Tuesday (2), daysToMonday = 6 (go back 6 days)
  // etc.
  const daysToMonday = (8 - jan4Day) % 7;
  const firstMonday = new Date(year, 0, 4 - daysToMonday);
  
  // Calculate the Monday of the requested week
  // Week 1 starts at firstMonday, week 2 starts 7 days later, etc.
  const weekStart = new Date(firstMonday);
  weekStart.setDate(firstMonday.getDate() + (week - 1) * 7);
  
  // Set to start of day to avoid timezone issues
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

export default function MentorDashboard() {
  const { sessions, hasData, setSessions, setMentees } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedMentor, setSelectedMentor] = useState<MentorMetrics | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [weekFilter, setWeekFilter] = useState<Date | undefined>(undefined);
  const [monthFilter, setMonthFilter] = useState<string>(''); // Format: YYYY-MM
  const [selectedMentorFilter, setSelectedMentorFilter] = useState<string[]>([]); // Multi-select: array of emails

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

  const mentorMetrics = useMemo(() => {
    if (!hasData) {
      return [];
    }
    const metrics = calculateMentorMetrics(sessions);
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
    // Pass array directly - function now handles both array and string
    const mentorFilter = selectedMentorFilter.length > 0 ? selectedMentorFilter : undefined;
    return calculateMentorSessionStats(sessions, weekFilter, monthFilter || undefined, mentorFilter);
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
                      // getDateFromWeek already returns the Monday of the week, but ensure it's normalized
                      date.setHours(0, 0, 0, 0);
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
              {/* Mentor Filter - Multi-select */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-300 whitespace-nowrap">Mentor:</label>
                <MentorMultiSelect
                  mentors={uniqueMentors}
                  selectedMentors={selectedMentorFilter}
                  onChange={setSelectedMentorFilter}
                />
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

