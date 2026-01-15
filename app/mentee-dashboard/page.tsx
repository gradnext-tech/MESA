'use client';

import React, { useMemo, useState } from 'react';
import { useData } from '@/context/DataContext';
import { calculateMenteeMetrics, getDetailedCandidateAnalytics, parseSessionDate, normalizeSessionStatus } from '@/utils/metricsCalculator';
import { getApiUrl } from '@/utils/api';
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
  RefreshCw,
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
import { startOfWeek, endOfWeek, format, parseISO, eachWeekOfInterval, min, max, isWithinInterval, startOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { Filter } from 'lucide-react';

// Multi-select component for mentees
const MenteeMultiSelect: React.FC<{
  mentees: Array<{ email: string; name: string }>;
  selectedMentees: string[];
  onChange: (selected: string[]) => void;
}> = ({ mentees, selectedMentees, onChange }) => {
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
    if (selectedMentees.includes(email)) {
      onChange(selectedMentees.filter(e => e !== email));
    } else {
      onChange([...selectedMentees, email]);
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
          {selectedMentees.length === 0 
            ? 'All Mentees' 
            : selectedMentees.length === 1
            ? mentees.find(m => m.email === selectedMentees[0])?.name || '1 mentee'
            : `${selectedMentees.length} mentees`}
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
              <span className="text-xs font-medium text-gray-300">Select Mentees</span>
              {selectedMentees.length > 0 && (
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
                checked={selectedMentees.length === 0}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded"
                style={{ accentColor: '#22C55E' }}
              />
              <span className="text-sm text-white">All Mentees</span>
            </label>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {mentees.map((mentee) => (
              <label
                key={mentee.email}
                className="flex items-center gap-2 p-2 hover:bg-[#1A3636] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedMentees.includes(mentee.email)}
                  onChange={() => handleToggle(mentee.email)}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: '#22C55E' }}
                />
                <div className="flex-1">
                  <span className="text-sm text-white">{mentee.name}</span>
                  <p className="text-xs text-gray-400 truncate">{mentee.email}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
      {selectedMentees.length > 0 && (
        <button
          onClick={() => onChange([])}
          className="ml-2 text-xs text-gray-400 hover:text-white px-2"
          title="Clear mentee filter"
        >
          ✕
        </button>
      )}
    </div>
  );
};

// Helper function to convert Date to week input value (YYYY-Www format, ISO week)
function getWeekInputValue(date: Date): string {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const year = weekStart.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const daysToMonday = (jan4Day === 1) ? 0 : (jan4Day - 1);
  const firstMonday = new Date(year, 0, 4 - daysToMonday);
  const diffInDays = Math.floor((weekStart.getTime() - firstMonday.getTime()) / (1000 * 60 * 60 * 24));
  const weekNum = Math.floor(diffInDays / 7) + 1;
  
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
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const daysToMonday = (8 - jan4Day) % 7;
  const firstMonday = new Date(year, 0, 4 - daysToMonday);
  const weekStart = new Date(firstMonday);
  weekStart.setDate(firstMonday.getDate() + (week - 1) * 7);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

export default function MenteeDashboard() {
  const { sessions, hasData, mentees, setSessions, setMentees, setCandidateFeedbacks } = useData();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [weekFilter, setWeekFilter] = useState<Date | undefined>(undefined);
  const [monthFilter, setMonthFilter] = useState<string>(''); // Format: YYYY-MM
  const [selectedMenteeFilter, setSelectedMenteeFilter] = useState<string[]>([]); // Multi-select: array of emails
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMentee, setSelectedMentee] = useState<CandidateSessionStats | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { candidateFeedbacks, setMentorFeedbacks } = useData();

  // Auto-fetch data if not available (when navigating directly to this page)
  React.useEffect(() => {
    if (!hasData || mentees.length === 0) {
      const autoConnect = async () => {
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
            setMentorFeedbacks(result.data.mentorFeedbacks || []);
          }
        } catch (error) {
          // Silently fail - user can refresh manually
        }
      };

      autoConnect();
    }
  }, [hasData, mentees.length, setSessions, setMentees, setCandidateFeedbacks, setMentorFeedbacks]);

  const menteeMetrics = useMemo(() => {
    if (!hasData) return null;
    const menteeFilter = selectedMenteeFilter.length > 0 ? selectedMenteeFilter : undefined;
    return calculateMenteeMetrics(sessions, weekFilter, mentees, candidateFeedbacks, monthFilter || undefined, menteeFilter);
  }, [sessions, hasData, weekFilter, monthFilter, selectedMenteeFilter, mentees, candidateFeedbacks]);

  // Calculate filtered sessions for metrics (same logic as in calculateMenteeMetrics)
  const filteredSessionsForMetrics = useMemo(() => {
    if (!hasData || !sessions || sessions.length === 0) return [];

    const isMentorDisruption = (status?: string) => {
      const normalized = normalizeSessionStatus(status);
      return (
        normalized === 'mentor_cancelled' ||
        normalized === 'mentor_no_show' ||
        normalized === 'mentor_rescheduled' ||
        normalized === 'admin_cancelled' ||
        normalized === 'admin_rescheduled'
      );
    };

    // Remove mentor-side disruptions
    let filtered = sessions.filter(s => !isMentorDisruption(s.sessionStatus));

    // Filter by week if provided
    if (weekFilter) {
      const weekStart = startOfWeek(weekFilter, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(weekFilter, { weekStartsOn: 1 });
      
      filtered = filtered.filter(session => {
        try {
          const sessionDate = parseSessionDate(session.date);
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

    // Filter by month if provided
    if (monthFilter) {
      const monthDate = new Date(monthFilter + '-01');
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      
      filtered = filtered.filter(session => {
        try {
          const sessionDate = parseSessionDate(session.date);
          if (!sessionDate) return false;
          const sessionDateNormalized = startOfDay(sessionDate);
          return isWithinInterval(sessionDateNormalized, {
            start: startOfDay(monthStart),
            end: startOfDay(monthEnd),
          });
        } catch {
          return false;
        }
      });
    }

    // Filter by mentee email(s) if provided
    if (selectedMenteeFilter.length > 0) {
      const normalizedFilterEmails = selectedMenteeFilter.map(e => (e || '').trim().toLowerCase()).filter(e => e);
      filtered = filtered.filter(session => {
        const sessionEmail = (session.menteeEmail || '').trim().toLowerCase();
        return normalizedFilterEmails.includes(sessionEmail);
      });
    }

    return filtered;
  }, [sessions, hasData, weekFilter, monthFilter, selectedMenteeFilter]);

  // Calculate total sessions (unfiltered) for average sessions per candidate metric
  const totalSessionsUnfiltered = useMemo(() => {
    if (!hasData) return 0;
    // Count all completed sessions without any filters
    // Filter out mentor-side disruptions (same logic as in calculateMenteeMetrics)
    const isMentorDisruption = (status?: string) => {
      const normalized = normalizeSessionStatus(status);
      return (
        normalized === 'mentor_cancelled' ||
        normalized === 'mentor_no_show' ||
        normalized === 'mentor_rescheduled' ||
        normalized === 'admin_cancelled' ||
        normalized === 'admin_rescheduled'
      );
    };
    
    const filteredSessions = sessions.filter(s => !isMentorDisruption(s.sessionStatus));
    const completedSessions = filteredSessions.filter(
      (s) => normalizeSessionStatus(s.sessionStatus) === 'completed'
    );
    return completedSessions.length;
  }, [sessions, hasData]);

  // Calculate unique candidates who have booked sessions (matching Mentee Directory with MESA sheet)
  const uniqueCandidatesWithSessions = useMemo(() => {
    if (!hasData || !mentees || mentees.length === 0) {
      // If no mentees directory, fallback to unique emails from sessions
      const uniqueEmails = new Set(sessions.map(s => (s.menteeEmail || '').trim().toLowerCase()).filter(e => e));
      return uniqueEmails.size;
    }

    // Get unique mentee emails and names from sessions (MESA sheet)
    const sessionMenteeEmails = new Set<string>();
    const sessionMenteeNames = new Set<string>();
    
    sessions.forEach(session => {
      const email = (session.menteeEmail || '').trim().toLowerCase();
      const name = (session.menteeName || '').trim().toLowerCase();
      if (email) sessionMenteeEmails.add(email);
      if (name) sessionMenteeNames.add(name);
    });

    // Match mentees from directory with sessions
    // Match by email (primary) or by name (fallback)
    const matchedMentees = new Set<string>();
    
    mentees.forEach(mentee => {
      const menteeEmail = (mentee.email || '').trim().toLowerCase();
      const menteeName = (mentee.name || '').trim().toLowerCase();
      
      // Match by email (exact match)
      if (menteeEmail && sessionMenteeEmails.has(menteeEmail)) {
        matchedMentees.add(menteeEmail);
        return;
      }
      
      // Match by name (case-insensitive, handle variations)
      if (menteeName && sessionMenteeNames.has(menteeName)) {
        matchedMentees.add(menteeEmail || menteeName);
        return;
      }
      
      // Try partial name matching (first name + last name)
      if (menteeName) {
        const nameParts = menteeName.split(/\s+/).filter((p: string) => p.length > 0);
        if (nameParts.length > 0) {
          const firstName = nameParts[0].toLowerCase();
          const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase() : '';
          
          // Check if any session name matches
          for (const sessionName of sessionMenteeNames) {
            const sessionNameParts = sessionName.split(/\s+/).filter((p: string) => p.length > 0);
            if (sessionNameParts.length > 0) {
              const sessionFirstName = sessionNameParts[0].toLowerCase();
              const sessionLastName = sessionNameParts.length > 1 ? sessionNameParts[sessionNameParts.length - 1].toLowerCase() : '';
              
              // Match if first and last names match
              if (firstName === sessionFirstName && lastName && sessionLastName && lastName === sessionLastName) {
                matchedMentees.add(menteeEmail || menteeName);
                break;
              }
            }
          }
        }
      }
    });

    return matchedMentees.size;
  }, [sessions, hasData, mentees]);

  // Get unique mentees for filter
  const uniqueMentees = useMemo(() => {
    const menteeMap = new Map<string, { email: string; name: string }>();
    sessions.forEach(session => {
      const email = session.menteeEmail;
      if (email && email.trim()) {
        const normalizedEmail = email.trim().toLowerCase();
        if (!menteeMap.has(normalizedEmail)) {
          menteeMap.set(normalizedEmail, {
            email: email,
            name: session.menteeName || email,
          });
        }
      }
    });
    return Array.from(menteeMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions]);

  const candidateAnalytics = useMemo(() => {
    if (!hasData) return [];
    // Apply filters to candidate analytics
    let filteredSessions = sessions;
    
    if (weekFilter) {
      const weekStart = startOfWeek(weekFilter, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(weekFilter, { weekStartsOn: 1 });
      filteredSessions = filteredSessions.filter(s => {
        const sessionDate = parseSessionDate(s.date);
        if (!sessionDate) return false;
        const sessionDateNormalized = startOfDay(sessionDate);
        return isWithinInterval(sessionDateNormalized, {
          start: startOfDay(weekStart),
          end: startOfDay(weekEnd),
        });
      });
    }
    
    if (monthFilter) {
      const monthDate = new Date(monthFilter + '-01');
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      filteredSessions = filteredSessions.filter(s => {
        const sessionDate = parseSessionDate(s.date);
        if (!sessionDate) return false;
        const sessionDateNormalized = startOfDay(sessionDate);
        return isWithinInterval(sessionDateNormalized, {
          start: startOfDay(monthStart),
          end: startOfDay(monthEnd),
        });
      });
    }
    
    if (selectedMenteeFilter.length > 0) {
      const normalizedFilterEmails = selectedMenteeFilter.map(e => (e || '').trim().toLowerCase()).filter(e => e);
      filteredSessions = filteredSessions.filter(s => {
        const sessionEmail = (s.menteeEmail || '').trim().toLowerCase();
        return normalizedFilterEmails.includes(sessionEmail);
      });
    }
    
    // Exclude mentor-side disruptions for mentee dashboard analytics
    const filteredWithoutMentorDisruptions = filteredSessions.filter(s => {
      const normalized = normalizeSessionStatus(s.sessionStatus);
      return (
        normalized !== 'mentor_cancelled' &&
        normalized !== 'mentor_no_show' &&
        normalized !== 'mentor_rescheduled' &&
        normalized !== 'admin_cancelled' &&
        normalized !== 'admin_rescheduled'
      );
    });

    return getDetailedCandidateAnalytics(filteredWithoutMentorDisruptions, candidateFeedbacks, filteredWithoutMentorDisruptions);
  }, [sessions, hasData, weekFilter, monthFilter, selectedMenteeFilter, candidateFeedbacks]);

  // Calculate additional metrics for new cards
  const top10BySessions = useMemo(() => {
    // Deduplicate by normalized email (case-insensitive)
    // candidateAnalytics should already be deduplicated, but we do it again for safety
    const uniqueCandidates = new Map<string, CandidateSessionStats>();
    
    candidateAnalytics.forEach(c => {
      // Skip candidates with 0 sessions
      if (!c.totalSessionsBooked || c.totalSessionsBooked === 0) return;
      
      const normalizedEmail = (c.email || '').trim().toLowerCase();
      const normalizedName = (c.name || '').trim().toLowerCase();
      
      // Skip if no identifier
      if (!normalizedEmail && !normalizedName) return;
      
      // Use email as primary key, fallback to name
      const key = normalizedEmail || normalizedName;
      
      const existing = uniqueCandidates.get(key);
      if (!existing) {
        uniqueCandidates.set(key, c);
      } else {
        // If duplicate, keep the one with more sessions
        if (c.totalSessionsBooked > existing.totalSessionsBooked) {
          uniqueCandidates.set(key, c);
        } else if (c.totalSessionsBooked === existing.totalSessionsBooked) {
          // If same sessions, prefer the one with better data
          if ((c.email && !existing.email) || (c.name && !existing.name)) {
            uniqueCandidates.set(key, c);
          }
        }
      }
    });
    
    const sorted = Array.from(uniqueCandidates.values())
      .sort((a, b) => {
        // First sort by totalSessionsBooked (descending)
        if (b.totalSessionsBooked !== a.totalSessionsBooked) {
          return b.totalSessionsBooked - a.totalSessionsBooked;
        }
        // If equal, sort by name alphabetically
        return (a.name || '').localeCompare(b.name || '');
      });
    
    
    return sorted.slice(0, 10);
  }, [candidateAnalytics]);

  const bottom10BySessions = useMemo(() => {
    // Deduplicate by normalized email (case-insensitive)
    const uniqueCandidates = new Map<string, CandidateSessionStats>();
    candidateAnalytics.forEach(c => {
      const normalizedEmail = (c.email || '').trim().toLowerCase();
      if (!normalizedEmail) return;
      
      const existing = uniqueCandidates.get(normalizedEmail);
      if (!existing || c.totalSessionsBooked < existing.totalSessionsBooked) {
        uniqueCandidates.set(normalizedEmail, c);
      }
    });
    
    const sorted = Array.from(uniqueCandidates.values())
      .sort((a, b) => {
        // First sort by totalSessionsBooked (ascending)
        if (a.totalSessionsBooked !== b.totalSessionsBooked) {
          return a.totalSessionsBooked - b.totalSessionsBooked;
        }
        // If equal, sort by name alphabetically
        return (a.name || '').localeCompare(b.name || '');
      });
    return sorted.slice(0, 10);
  }, [candidateAnalytics]);

  const candidatesHighRating = useMemo(() => {
    // Deduplicate by normalized email (case-insensitive)
    const uniqueCandidates = new Map<string, CandidateSessionStats>();
    candidateAnalytics.forEach(c => {
      if (c.avgFeedback > 4.75 && c.avgFeedback > 0) {
        const normalizedEmail = (c.email || '').trim().toLowerCase();
        if (!normalizedEmail) return;
        
        const existing = uniqueCandidates.get(normalizedEmail);
        if (!existing || c.avgFeedback > existing.avgFeedback) {
          uniqueCandidates.set(normalizedEmail, c);
        }
      }
    });
    
    // Sort by rating descending (highest first)
    const sorted = Array.from(uniqueCandidates.values())
      .sort((a, b) => {
        // First sort by avgFeedback (descending)
        if (b.avgFeedback !== a.avgFeedback) {
          return b.avgFeedback - a.avgFeedback;
        }
        // If equal, sort by name alphabetically
        return (a.name || '').localeCompare(b.name || '');
      });
    
    return sorted;
  }, [candidateAnalytics]);

  const candidatesLowRating = useMemo(() => {
    // Deduplicate by normalized email (case-insensitive)
    const uniqueCandidates = new Map<string, CandidateSessionStats>();
    candidateAnalytics.forEach(c => {
      if (c.avgFeedback > 0 && c.avgFeedback < 3.5) {
        const normalizedEmail = (c.email || '').trim().toLowerCase();
        if (!normalizedEmail) return;
        
        const existing = uniqueCandidates.get(normalizedEmail);
        if (!existing || c.avgFeedback < existing.avgFeedback) {
          uniqueCandidates.set(normalizedEmail, c);
        }
      }
    });
    
    // Sort by rating ascending (lowest first)
    const sorted = Array.from(uniqueCandidates.values())
      .sort((a, b) => {
        // First sort by avgFeedback (ascending)
        if (a.avgFeedback !== b.avgFeedback) {
          return a.avgFeedback - b.avgFeedback;
        }
        // If equal, sort by name alphabetically
        return (a.name || '').localeCompare(b.name || '');
      });
    
    return sorted;
  }, [candidateAnalytics]);

  const filteredCandidates = useMemo(() => {
    let filtered = candidateAnalytics;
    
    // Apply mentee filter if selected
    if (selectedMenteeFilter.length > 0) {
      const normalizedFilterEmails = selectedMenteeFilter.map(e => (e || '').trim().toLowerCase()).filter(e => e);
      filtered = filtered.filter(c => {
        const candidateEmail = (c.email || '').trim().toLowerCase();
        return normalizedFilterEmails.includes(candidateEmail);
      });
    }
    
    // Apply search term filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.email.toLowerCase().includes(term)
      );
    }
    
    return filtered;
  }, [candidateAnalytics, searchTerm, selectedMenteeFilter]);

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
        setMentorFeedbacks(result.data.mentorFeedbacks || []);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Weekwise Session Booked Data
  const weekwiseSessionData = useMemo(() => {
    if (!hasData || sessions.length === 0) {
      return [];
    }
    
    // Apply filters to sessions for weekwise chart
    let filteredSessions = sessions;
    
    // Apply week filter (takes precedence over month filter)
    if (weekFilter) {
      const weekStart = startOfWeek(weekFilter, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(weekFilter, { weekStartsOn: 1 });
      filteredSessions = filteredSessions.filter(s => {
        const sessionDate = parseSessionDate(s.date);
        if (!sessionDate) return false;
        const sessionDateNormalized = startOfDay(sessionDate);
        return isWithinInterval(sessionDateNormalized, {
          start: startOfDay(weekStart),
          end: startOfDay(weekEnd),
        });
      });
    }
    // Apply month filter (only if week filter is not set)
    else if (monthFilter) {
      const monthDate = new Date(monthFilter + '-01');
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      filteredSessions = filteredSessions.filter(s => {
        const sessionDate = parseSessionDate(s.date);
        if (!sessionDate) return false;
        const sessionDateNormalized = startOfDay(sessionDate);
        return isWithinInterval(sessionDateNormalized, {
          start: startOfDay(monthStart),
          end: startOfDay(monthEnd),
        });
      });
    }
    
    // Apply mentee filter
    if (selectedMenteeFilter.length > 0) {
      const normalizedFilterEmails = selectedMenteeFilter.map(e => (e || '').trim().toLowerCase()).filter(e => e);
      filteredSessions = filteredSessions.filter(s => {
        const sessionEmail = (s.menteeEmail || '').trim().toLowerCase();
        return normalizedFilterEmails.includes(sessionEmail);
      });
    }
    
    // Exclude mentor-side disruptions for mentee dashboard
    filteredSessions = filteredSessions.filter(s => {
      const normalized = normalizeSessionStatus(s.sessionStatus);
      return (
        normalized !== 'mentor_cancelled' &&
        normalized !== 'mentor_no_show' &&
        normalized !== 'mentor_rescheduled' &&
        normalized !== 'admin_cancelled' &&
        normalized !== 'admin_rescheduled'
      );
    });
    
    // Get all session dates with consistent parsing
    const sessionDates: Date[] = [];
    filteredSessions.forEach(s => {
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
    
    // Generate all weeks in the range
    const weeks = eachWeekOfInterval(
      { start: minDate, end: maxDate },
      { weekStartsOn: 1 } // Monday
    );
    
    // Count sessions per week using the same parsing function
    const weekData = weeks.map(weekStart => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekStartNormalized = startOfDay(weekStart);
      const weekEndNormalized = startOfDay(weekEnd);
      
      const weekSessions = filteredSessions.filter(s => {
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
      
      // Count completed sessions (status is "completed" or "done")
      const completedSessions = weekSessions.filter(s => {
        const status = (s.sessionStatus || '').toLowerCase().trim();
        return status === 'completed' || status === 'done';
      });
      
      return {
        week: format(weekStart, 'MMM d'),
        weekStart: weekStart.toISOString(),
        sessions: weekSessions.length,
        sessionsDone: completedSessions.length,
        weekLabel: `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`,
      };
    });
    
    // Return all weeks (including those with 0 sessions) for complete trend visualization
    return weekData;
  }, [sessions, hasData, weekFilter, monthFilter, selectedMenteeFilter]);

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
      <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
            <h1 className="text-3xl font-bold text-white">Student Dashboard</h1>
            <p className="text-gray-300 mt-1">
            Comprehensive analytics for student engagement and performance
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
          {/* Mentee Filter - Multi-select */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-300 whitespace-nowrap">Mentee:</label>
            <MenteeMultiSelect
              mentees={uniqueMentees}
              selectedMentees={selectedMenteeFilter}
              onChange={setSelectedMenteeFilter}
            />
          </div>
        </div>
      </div>

      {/* Primary Metrics - 3 cards per row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricCard
          title="Total Sessions Done"
          value={menteeMetrics.totalSessionsDone}
          icon={Calendar}
          iconColor="text-[#22C55E]"
          subtitle="Completed sessions"
        />
        <MetricCard
          title="# of Unique Candidates"
          value={uniqueCandidatesWithSessions}
          icon={Users}
          iconColor="text-[#22C55E]"
          subtitle="Candidates from Mentee Directory who booked sessions"
        />
        <MetricCard
          title="Avg Sessions Per Candidate"
          value={(() => {
            // Formula: Total Sessions Done (filtered) / Total Candidates (from Mentee Directory)
            if (!hasData || !mentees || mentees.length === 0 || !menteeMetrics) {
              return 'N/A';
            }
            
            // Use filtered sessions count from menteeMetrics (already filtered by week/month/mentee)
            const totalSessionsDone = menteeMetrics.totalSessionsDone;
            const totalCandidates = mentees.length;
            return totalSessionsDone > 0 
              ? (totalSessionsDone / totalCandidates).toFixed(2)
              : '0.00';
          })()}
          icon={TrendingUp}
          iconColor="text-[#22C55E]"
          subtitle="Total Sessions Done (filtered) / Total Candidates (from Mentee Directory)"
        />
        <MetricCard
          title="Avg Sessions Per Active Candidate"
          value={(() => {
            // Formula: Total Sessions Done (filtered) / Candidates with at least 1 session in filtered range (who are in Mentee Directory)
            if (!hasData || !mentees || mentees.length === 0 || !menteeMetrics) {
              return 'N/A';
            }
            
            // Use filtered sessions count from menteeMetrics (already filtered by week/month/mentee)
            const totalSessionsDone = menteeMetrics.totalSessionsDone;
            
            // Get unique mentee names from filtered sessions (who have booked at least 1 session in the filtered range)
            const filteredCompletedSessions = filteredSessionsForMetrics.filter(
              s => normalizeSessionStatus(s.sessionStatus) === 'completed'
            );
            
            const sessionMenteeNames = new Set(
              filteredCompletedSessions
                .map(s => (s.menteeName || '').trim().toLowerCase())
                .filter(name => name)
            );
            
            // Count how many candidates from Mentee Directory have booked at least 1 session in the filtered range
            const activeCandidatesCount = mentees.filter(mentee => {
              const menteeName = (mentee.name || '').trim().toLowerCase();
              return menteeName && sessionMenteeNames.has(menteeName);
            }).length;
            
            return activeCandidatesCount > 0 
              ? (totalSessionsDone / activeCandidatesCount).toFixed(2)
              : '0.00';
          })()}
          icon={TrendingUp}
          iconColor="text-[#22C55E]"
          subtitle="Total Sessions Done (filtered) / Active Candidates (from Mentee Directory)"
        />
        <MetricCard
          title="Total Sessions Cancelled / Rescheduled / No Show"
          value={
            menteeMetrics.totalSessionsCancelled +
            menteeMetrics.totalSessionsRescheduled +
            menteeMetrics.totalNoShows
          }
          icon={XCircle}
          iconColor="text-red-500"
          subtitle="Disruptions"
        />
        <MetricCard
          title="Avg. Rating"
          value={menteeMetrics.avgFeedbackScore > 0 ? menteeMetrics.avgFeedbackScore.toFixed(2) : 'N/A'}
          icon={Star}
          iconColor="text-[#22C55E]"
          subtitle="Overall average"
        />
      </div>

      {/* Candidate Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top 10 Candidates by Sessions */}
        <div className="rounded-xl shadow-md p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)' }}>
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Top 10 Candidates by Sessions</h3>
              <p className="text-xs text-gray-400">Candidates with most sessions</p>
            </div>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {top10BySessions.length === 0 ? (
              <p className="text-gray-400 text-sm">No candidates found</p>
            ) : (
              top10BySessions.map((candidate, index) => {
                // Create a unique key that's case-insensitive
                const uniqueKey = `${(candidate.email || '').toLowerCase()}_${(candidate.name || '').toLowerCase()}_${index}`;
                return (
                  <div
                    key={uniqueKey}
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
                );
              })
            )}
          </div>
      </div>

        {/* Candidates with >4.75 Rating */}
        <div className="rounded-xl shadow-md p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)' }}>
              <Award className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Candidates with &gt;4.75 Rating</h3>
              <p className="text-xs text-gray-400">{candidatesHighRating.length} candidates</p>
            </div>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {candidatesHighRating.length === 0 ? (
              <p className="text-gray-400 text-sm">No candidates found</p>
            ) : (
              candidatesHighRating.map((candidate, index) => (
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

        {/* Bottom 10 Candidates by Sessions */}
        <div className="rounded-xl shadow-md p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            <div>
              <h3 className="text-lg font-semibold text-white">Bottom 10 Candidates by Sessions</h3>
              <p className="text-xs text-gray-400">Candidates with fewest sessions</p>
            </div>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {bottom10BySessions.length === 0 ? (
              <p className="text-gray-400 text-sm">No candidates found</p>
            ) : (
              bottom10BySessions.map((candidate, index) => (
                <div
                  key={candidate.email}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-[#1A3636] cursor-pointer transition-colors"
                  onClick={() => handleMenteeClick(candidate)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-orange-500 w-6">#{index + 1}</span>
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

        {/* Candidates with <3.5 Rating */}
        <div className="rounded-xl shadow-md p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <div>
              <h3 className="text-lg font-semibold text-white">Candidates with &lt;3.5 Rating</h3>
              <p className="text-xs text-gray-400">{candidatesLowRating.length} candidates</p>
            </div>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {candidatesLowRating.length === 0 ? (
              <p className="text-gray-400 text-sm">No candidates found</p>
            ) : (
              candidatesLowRating.map((candidate, index) => (
                <div
                  key={candidate.email}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-[#1A3636] cursor-pointer transition-colors"
                  onClick={() => handleMenteeClick(candidate)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-red-500 w-6">#{index + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-white">{candidate.name || candidate.email}</p>
                      <div className="flex items-center gap-2">
                        <Star className="w-3 h-3 text-red-400" />
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
                name="Total Sessions Scheduled"
              />
              <Line
                type="monotone"
                dataKey="sessionsDone"
                stroke="#86EFAC"
                strokeWidth={3}
                dot={{ fill: '#86EFAC', r: 5 }}
                activeDot={{ r: 7, fill: '#4ADE80' }}
                name="Total Sessions Done"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
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
                    <div className="flex flex-col gap-1">
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
                      {candidate.sessionsRescheduled > 0 && (
                        <span className="text-xs text-yellow-400">
                          {candidate.sessionsRescheduled} rescheduled
                        </span>
                      )}
                      {candidate.sessionsCancelled === 0 && candidate.sessionsNoShow === 0 && candidate.sessionsRescheduled === 0 && (
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
          candidateFeedbacks={candidateFeedbacks}
        />
      )}
    </div>
  );
}

