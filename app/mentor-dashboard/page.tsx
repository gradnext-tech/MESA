'use client';

import React, { useMemo, useState } from 'react';
import { useData } from '@/context/DataContext';
import { calculateMentorMetrics, calculateMentorSessionStats, normalizeSessionStatus, parseSessionDate } from '@/utils/metricsCalculator';
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
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format, parseISO, isWithinInterval, startOfDay } from 'date-fns';
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
  const { sessions, hasData, setSessions, setMentees, mentorFeedbacks, setMentorFeedbacks, setCandidateFeedbacks } = useData();
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
          const response = await fetch('api/sheets', {
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
            // Always set mentorFeedbacks - even if empty array, this ensures the state is properly initialized
            setMentorFeedbacks(Array.isArray(result.data.mentorFeedbacks) ? result.data.mentorFeedbacks : []);
          }
        } catch (error) {
        }
      };

      autoConnect();
    }
  }, [hasData]);

  // Filter sessions based on week/month/mentor filters
  const filteredSessions = useMemo(() => {
    let filtered = sessions;
    
    // Apply week filter (takes precedence over month filter)
    if (weekFilter) {
      const weekStart = startOfWeek(weekFilter, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(weekFilter, { weekStartsOn: 1 });
      filtered = filtered.filter(s => {
        try {
          const sessionDate = parseSessionDate(s.date);
          if (!sessionDate) return false;
          const sessionDateNormalized = startOfDay(sessionDate);
          return isWithinInterval(sessionDateNormalized, {
            start: startOfDay(weekStart),
            end: startOfDay(weekEnd),
          });
        } catch {
          return false;
        }
      });
    }
    // Apply month filter (only if week filter is not set)
    else if (monthFilter) {
      const monthDate = new Date(monthFilter + '-01');
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      filtered = filtered.filter(s => {
        const sessionDate = parseSessionDate(s.date);
        if (!sessionDate) return false;
        const sessionDateNormalized = startOfDay(sessionDate);
        return isWithinInterval(sessionDateNormalized, {
          start: startOfDay(monthStart),
          end: startOfDay(monthEnd),
        });
      });
    }
    
    // Apply mentor filter
    if (selectedMentorFilter.length > 0) {
      const normalizedFilterEmails = selectedMentorFilter.map(e => (e || '').trim().toLowerCase()).filter(e => e);
      filtered = filtered.filter(s => {
        const sessionEmail = (s.mentorEmail || '').trim().toLowerCase();
        return normalizedFilterEmails.includes(sessionEmail);
      });
    }
    
    return filtered;
  }, [sessions, weekFilter, monthFilter, selectedMentorFilter]);

  // Filter mentorFeedbacks based on the same filters (for rating calculation)
  // Directly filter the Mentor Feedbacks filled by candidate sheet
  const filteredMentorFeedbacks = useMemo(() => {
    // Always return an array, even if mentorFeedbacks is empty or undefined
    if (!Array.isArray(mentorFeedbacks) || mentorFeedbacks.length === 0) {
      return [];
    }

    // If no filters are applied, return all mentorFeedbacks
    if (!weekFilter && !monthFilter && selectedMentorFilter.length === 0) {
      return mentorFeedbacks;
    }

    let filtered = [...mentorFeedbacks]; // Create a copy to avoid mutating original

    // Helper function to extract date from feedback object
    const getFeedbackDate = (fb: any): string | null => {
      // Try multiple possible date field names (checking common variations)
      const dateFields = [
        'Session Date',
        'sessionDate',
        'Date',
        'date',
        'Date of Session',
        'SessionDate',
        'DATE',
        'Date of session',
        'Session date',
        'Session_Date',
        'session_date',
        'Date of session',
        'Session Date (MM/DD/YYYY)',
        'Date (MM/DD/YYYY)',
        'Timestamp',
        'timestamp',
        'When was the session?',
        'Session date and time',
        'Date/Time',
        'dateTime',
        'DateTime'
      ];
      
      // First, try exact field name matches
      for (const field of dateFields) {
        const value = fb[field];
        if (value && typeof value === 'string' && value.trim()) {
          return value.trim();
        }
        // Also try case-insensitive match
        const lowerField = field.toLowerCase();
        for (const key in fb) {
          if (key.toLowerCase() === lowerField && fb[key] && typeof fb[key] === 'string' && fb[key].trim()) {
            return String(fb[key]).trim();
          }
        }
      }
      
      // If no exact match, try to find any field that looks like a date
      // (contains 'date' or 'time' in the key name)
      for (const key in fb) {
        const lowerKey = key.toLowerCase();
        if ((lowerKey.includes('date') || lowerKey.includes('time')) && fb[key]) {
          const value = String(fb[key]).trim();
          if (value && value.length > 0) {
            // Try to parse it to see if it's a valid date
            const testDate = parseSessionDate(value);
            if (testDate) {
              return value;
            }
          }
        }
      }
      
      return null;
    };

    // Helper function to extract mentor info from feedback
    const getMentorInfo = (fb: any): { name: string; email: string } => {
      const name = (fb['Mentor Name'] || fb['mentorName'] || fb['Mentor'] || fb['mentor'] || '').trim();
      const email = (fb['Mentor Email'] || fb['mentorEmail'] || fb['Mentor Email ID'] || fb['mentorEmailId'] || '').trim();
      return { name: name.toLowerCase(), email: email.toLowerCase() };
    };

    // Apply week filter (takes precedence over month filter)
    if (weekFilter) {
      const weekStart = startOfWeek(weekFilter, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(weekFilter, { weekStartsOn: 1 });
      // Make end date inclusive by using end of day
      const weekEndInclusive = new Date(weekEnd);
      weekEndInclusive.setHours(23, 59, 59, 999);
      
      // Build a map of mentors who have sessions in the filtered week
      // Map both email and name for matching
      const mentorsInFilteredWeek = new Set<string>();
      const mentorEmailToName = new Map<string, string>();
      const mentorNameToEmail = new Map<string, string>();
      
      filteredSessions.forEach(s => {
        const email = (s.mentorEmail || '').trim().toLowerCase();
        const name = (s.mentorName || '').trim().toLowerCase();
        
        if (email) {
          mentorsInFilteredWeek.add(email);
          if (name) {
            mentorEmailToName.set(email, name);
            mentorNameToEmail.set(name, email);
          }
        }
        if (name) {
          mentorsInFilteredWeek.add(name);
        }
      });
      
      const beforeCount = filtered.length;
      let matchedByDate = 0;
      let matchedByMentor = 0;
      
      // Filter feedbacks: match by date first, then by mentor if date doesn't match
      // This ensures we get feedbacks for sessions in the filtered week
      filtered = filtered.filter((fb: any) => {
        const mentorInfo = getMentorInfo(fb);
        const sessionDateStr = getFeedbackDate(fb);
        
        // First, try to match by date (most precise)
        if (sessionDateStr) {
          try {
            const sessionDate = parseSessionDate(sessionDateStr);
            if (sessionDate) {
              const sessionTime = sessionDate.getTime();
              const weekStartTime = weekStart.getTime();
              const weekEndTime = weekEndInclusive.getTime();
              
              // If date is in the week range, include it
              if (sessionTime >= weekStartTime && sessionTime <= weekEndTime) {
                matchedByDate++;
                return true;
              }
            }
          } catch (e) {
            // Date parsing failed, continue to mentor matching
          }
        }
        
        // If date doesn't match or is not available, match by mentor
        // This handles cases where feedback date might differ from session date
        const mentorMatches = 
          (mentorInfo.email && mentorsInFilteredWeek.has(mentorInfo.email)) ||
          (mentorInfo.name && mentorsInFilteredWeek.has(mentorInfo.name)) ||
          (mentorInfo.email && mentorEmailToName.has(mentorInfo.email) && 
           mentorsInFilteredWeek.has(mentorEmailToName.get(mentorInfo.email)!)) ||
          (mentorInfo.name && mentorNameToEmail.has(mentorInfo.name) && 
           mentorsInFilteredWeek.has(mentorNameToEmail.get(mentorInfo.name)!));
        
        if (mentorMatches) {
          matchedByMentor++;
          return true;
        }
        
        return false;
      });
      
    }
    // Apply month filter (only if week filter is not set)
    else if (monthFilter) {
      const monthDate = new Date(monthFilter + '-01');
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      const beforeCount = filtered.length;
      
      filtered = filtered.filter((fb: any) => {
        const sessionDateStr = getFeedbackDate(fb);
        if (!sessionDateStr) {
          return false;
        }
        
        try {
          const sessionDate = parseSessionDate(sessionDateStr);
          if (!sessionDate) {
            return false;
          }
          const sessionDateNormalized = startOfDay(sessionDate);
          return isWithinInterval(sessionDateNormalized, {
            start: startOfDay(monthStart),
            end: startOfDay(monthEnd),
          });
        } catch (e) {
          return false;
        }
      });
      
    }

    // Apply mentor filter
    if (selectedMentorFilter.length > 0) {
      const normalizedFilterEmails = selectedMentorFilter.map(e => (e || '').trim().toLowerCase()).filter(e => e);
      
      // Build a comprehensive map of mentor names to emails from all sessions
      const mentorNameEmailMap = new Map<string, string[]>();
      sessions.forEach(s => {
        if (s.mentorEmail && s.mentorName) {
          const email = (s.mentorEmail || '').trim().toLowerCase();
          const name = (s.mentorName || '').trim().toLowerCase();
          if (email && name) {
            if (!mentorNameEmailMap.has(name)) {
              mentorNameEmailMap.set(name, []);
            }
            if (!mentorNameEmailMap.get(name)!.includes(email)) {
              mentorNameEmailMap.get(name)!.push(email);
            }
          }
        }
      });

      const beforeCount = filtered.length;
      filtered = filtered.filter((fb: any) => {
        const mentorInfo = getMentorInfo(fb);
        
        // Check if mentor email matches any selected mentor
        if (mentorInfo.email && normalizedFilterEmails.includes(mentorInfo.email)) {
          return true;
        }
        
        // Check if mentor name matches (via name-to-email mapping)
        if (mentorInfo.name) {
          const mappedEmails = mentorNameEmailMap.get(mentorInfo.name) || [];
          return mappedEmails.some(email => normalizedFilterEmails.includes(email));
        }
        
        return false;
      });
      
    }
    
    return filtered;
  }, [mentorFeedbacks, weekFilter, monthFilter, selectedMentorFilter, sessions, filteredSessions]);

  const mentorMetrics = useMemo(() => {
    if (!hasData) {
      return [];
    }
    
    // For rating calculation, always try to use mentorFeedbacks if available
    // Priority: filteredMentorFeedbacks (when filters applied) > mentorFeedbacks > undefined
    let feedbacksForRating: any[] | undefined = undefined;
    
    // First, check if we have any mentorFeedbacks at all
    if (Array.isArray(mentorFeedbacks) && mentorFeedbacks.length > 0) {
      // We have mentorFeedbacks - use filtered version if filters are applied, otherwise use all
      if (weekFilter || monthFilter || selectedMentorFilter.length > 0) {
        // Filters are applied - use filtered feedbacks (even if empty, it means no matches)
        feedbacksForRating = Array.isArray(filteredMentorFeedbacks) ? filteredMentorFeedbacks : mentorFeedbacks;
      } else {
        // No filters - use all mentorFeedbacks
        feedbacksForRating = mentorFeedbacks;
      }
    }
    // If no mentorFeedbacks, leave as undefined to trigger fallback to session-based ratings
    
    // For other metrics (sessions done, cancelled, etc.), use filtered sessions
    const metrics = calculateMentorMetrics(filteredSessions, sessions, feedbacksForRating);
    
    return metrics;
  }, [filteredSessions, sessions, hasData, filteredMentorFeedbacks, mentorFeedbacks, weekFilter, monthFilter, selectedMentorFilter]);

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
    // Use filteredSessions to respect applied filters
    return filteredSessions.filter(s => s.mentorEmail === selectedMentor.mentorEmail);
  }, [selectedMentor, filteredSessions]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch('api/sheets', {
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
        setCandidateFeedbacks(result.data.candidateFeedbacks || []);
        // Always set mentorFeedbacks - even if empty array, this ensures the state is properly initialized
        setMentorFeedbacks(Array.isArray(result.data.mentorFeedbacks) ? result.data.mentorFeedbacks : []);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Calculate average daily and weekly sessions
  const avgDailyAndWeeklySessions = useMemo(() => {
    if (!hasData || filteredSessions.length === 0) {
      return { avgDailySessions: 0, avgWeeklySessions: 0 };
    }

    // Get unique dates and weeks
    const uniqueDates = new Set<string>();
    const uniqueWeeks = new Set<string>();
    
    filteredSessions.forEach(s => {
      if (!s.date) return;
      const sessionDate = parseSessionDate(s.date);
      if (!sessionDate) return;
      
      // Add unique date (YYYY-MM-DD format)
      const dateKey = format(sessionDate, 'yyyy-MM-dd');
      uniqueDates.add(dateKey);
      
      // Add unique week (Monday of the week)
      const weekStart = startOfWeek(sessionDate, { weekStartsOn: 1 });
      const weekKey = format(weekStart, 'yyyy-MM-dd');
      uniqueWeeks.add(weekKey);
    });

    const totalSessions = filteredSessions.filter(s => {
      const status = normalizeSessionStatus(s.sessionStatus);
      return status === 'completed';
    }).length;

    const avgDailySessions = uniqueDates.size > 0 ? totalSessions / uniqueDates.size : 0;
    const avgWeeklySessions = uniqueWeeks.size > 0 ? totalSessions / uniqueWeeks.size : 0;

    return { avgDailySessions, avgWeeklySessions };
  }, [filteredSessions, hasData]);

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

    const mentorsWithRatings = mentorMetrics.filter(m => m.avgRating > 0);
    const avgRating = mentorsWithRatings.length > 0
      ? mentorsWithRatings.reduce((sum, m) => sum + m.avgRating, 0) / mentorsWithRatings.length
      : 0;

    return {
      totalMentors: mentorMetrics.length,
      avgRating,
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
    // Sessions are already filtered by date, so just pass them directly
    // Always try to use mentorFeedbacks if available
    let feedbacksForRating: any[] | undefined = undefined;
    
    // First, check if we have any mentorFeedbacks at all
    if (Array.isArray(mentorFeedbacks) && mentorFeedbacks.length > 0) {
      // We have mentorFeedbacks - use filtered version if filters are applied, otherwise use all
      if (weekFilter || monthFilter || selectedMentorFilter.length > 0) {
        // Filters are applied - use filtered feedbacks (even if empty, it means no matches)
        feedbacksForRating = Array.isArray(filteredMentorFeedbacks) ? filteredMentorFeedbacks : mentorFeedbacks;
      } else {
        // No filters - use all mentorFeedbacks
        feedbacksForRating = mentorFeedbacks;
      }
    }
    // If no mentorFeedbacks, leave as undefined to trigger fallback to session-based ratings
    
    const stats = calculateMentorSessionStats(filteredSessions, weekFilter, monthFilter || undefined, mentorFilter, sessions, feedbacksForRating);
    return stats;
  }, [filteredSessions, sessions, hasData, weekFilter, monthFilter, selectedMentorFilter, filteredMentorFeedbacks, mentorFeedbacks]);

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <AlertCircle className="w-16 h-16 text-gray-400 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">No Data Available</h2>
        <p className="text-gray-300 mb-6">Please upload your session data first</p>
        <Link
          href="./"
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
      <div className="space-y-4">
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

        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Week Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <label className="text-sm text-gray-300 whitespace-nowrap">Week:</label>
            <input
              type="week"
              value={weekFilter ? getWeekInputValue(weekFilter) : ''}
              onChange={(e) => {
                if (e.target.value) {
                  const [year, week] = e.target.value.split('-W');
                  const date = getDateFromWeek(parseInt(year), parseInt(week));
                  date.setHours(0, 0, 0, 0);
                  setWeekFilter(date);
                  setMonthFilter(''); // Clear month filter when week is selected
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
                  setWeekFilter(undefined); // Clear week filter when month is selected
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

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
          title="Average Daily Sessions"
          value={avgDailyAndWeeklySessions.avgDailySessions > 0 ? avgDailyAndWeeklySessions.avgDailySessions.toFixed(2) : '0.00'}
          icon={Calendar}
          iconColor="text-[#22C55E]"
          subtitle="Sessions per day"
        />
        <MetricCard
          title="Average Weekly Sessions"
          value={avgDailyAndWeeklySessions.avgWeeklySessions > 0 ? avgDailyAndWeeklySessions.avgWeeklySessions.toFixed(2) : '0.00'}
          icon={TrendingUp}
          iconColor="text-[#22C55E]"
          subtitle="Sessions per week"
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
          <h3 className="text-lg font-semibold text-white">Mentor Session Statistics</h3>
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

