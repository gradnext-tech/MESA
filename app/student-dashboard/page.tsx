'use client';

import React, { useMemo, useState } from 'react';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { calculateStudentMetrics, getDetailedCandidateAnalytics, parseSessionDate, normalizeSessionStatus } from '@/utils/metricsCalculator';
import { getApiUrl } from '@/utils/api';
import { MetricCard } from '@/components/MetricCard';
import { DetailModal } from '@/components/DetailModal';
import { CandidateSessionStats, Session } from '@/types';
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
  X,
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

// Multi-select component for students
const StudentMultiSelect: React.FC<{
  students: Array<{ email: string; name: string }>;
  selectedStudents: string[];
  onChange: (selected: string[]) => void;
}> = ({ students, selectedStudents, onChange }) => {
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
    if (selectedStudents.includes(email)) {
      onChange(selectedStudents.filter(e => e !== email));
    } else {
      onChange([...selectedStudents, email]);
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
          {selectedStudents.length === 0 
            ? 'All Students' 
            : selectedStudents.length === 1
            ? students.find(m => m.email === selectedStudents[0])?.name || '1 student'
            : `${selectedStudents.length} students`}
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
              <span className="text-xs font-medium text-gray-300">Select Students</span>
              {selectedStudents.length > 0 && (
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
                checked={selectedStudents.length === 0}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded"
                style={{ accentColor: '#22C55E' }}
              />
              <span className="text-sm text-white">All Students</span>
            </label>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {students.map((student) => (
              <label
                key={student.email}
                className="flex items-center gap-2 p-2 hover:bg-[#1A3636] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedStudents.includes(student.email)}
                  onChange={() => handleToggle(student.email)}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: '#22C55E' }}
                />
                <div className="flex-1">
                  <span className="text-sm text-white">{student.name}</span>
                  <p className="text-xs text-gray-400 truncate">{student.email}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
      {selectedStudents.length > 0 && (
        <button
          onClick={() => onChange([])}
          className="ml-2 text-xs text-gray-400 hover:text-white px-2"
          title="Clear student filter"
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

export default function StudentDashboard() {
  const { sessions, hasData, students, setSessions, setStudents, setCandidateFeedbacks } = useData();
  const { accessLevel, email: loggedInEmail } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [weekFilter, setWeekFilter] = useState<Date | undefined>(undefined);
  const [monthFilter, setMonthFilter] = useState<string>(''); // Format: YYYY-MM
  const [selectedStudentFilter, setSelectedStudentFilter] = useState<string[]>([]); // Multi-select: array of emails
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<CandidateSessionStats | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedSessionIndex, setExpandedSessionIndex] = useState<number | null>(null);

  const { candidateFeedbacks, setMentorFeedbacks } = useData();

  const isPersonalStudent = accessLevel === 'student';

  // If logged in as a personal student, lock the filter to their email so they only see their own data
  React.useEffect(() => {
    if (!isPersonalStudent) return;
    const email = (loggedInEmail || '').trim().toLowerCase();
    if (!email) return;
    if (selectedStudentFilter.length === 1 && (selectedStudentFilter[0] || '').trim().toLowerCase() === email) return;
    setSelectedStudentFilter([email]);
  }, [isPersonalStudent, loggedInEmail, selectedStudentFilter]);

  // Auto-fetch data if not available (when navigating directly to this page)
  React.useEffect(() => {
    if (!hasData || students.length === 0) {
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
            setMentorFeedbacks(result.data.mentorFeedbacks || []);
          }
        } catch (error) {
          // Silently fail - user can refresh manually
        }
      };

      autoConnect();
    }
  }, [hasData, students.length, setSessions, setStudents, setCandidateFeedbacks, setMentorFeedbacks]);

  const studentMetrics = useMemo(() => {
    if (!hasData) return null;
    const studentFilter = selectedStudentFilter.length > 0 ? selectedStudentFilter : undefined;
    return calculateStudentMetrics(sessions, weekFilter, students, candidateFeedbacks, monthFilter || undefined, studentFilter);
  }, [sessions, hasData, weekFilter, monthFilter, selectedStudentFilter, students, candidateFeedbacks]);

  // Calculate filtered sessions for metrics (same logic as in calculateStudentMetrics)
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

    // Filter by student email(s) if provided
    if (selectedStudentFilter.length > 0) {
      const normalizedFilterEmails = selectedStudentFilter.map(e => (e || '').trim().toLowerCase()).filter(e => e);
      filtered = filtered.filter(session => {
        const sessionEmail = (session.studentEmail || '').trim().toLowerCase();
        return normalizedFilterEmails.includes(sessionEmail);
      });
    }

    return filtered;
  }, [sessions, hasData, weekFilter, monthFilter, selectedStudentFilter]);

  // Calculate total sessions (unfiltered) for average sessions per candidate metric
  const totalSessionsUnfiltered = useMemo(() => {
    if (!hasData) return 0;
    // Count all completed sessions without any filters
    // Filter out mentor-side disruptions (same logic as in calculateStudentMetrics)
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

  // Calculate unique candidates who have booked sessions (matching Student Directory with MESA sheet)
  // This now respects the week/month/student filters
  const uniqueCandidatesWithSessions = useMemo(() => {
    // Use filtered sessions (already completed-only) to respect filters
    const sessionsToUse = filteredSessionsForMetrics;
    
    if (!hasData || !students || students.length === 0) {
      // If no students directory, fallback to unique emails from filtered sessions
      const uniqueEmails = new Set(sessionsToUse.map(s => (s.studentEmail || '').trim().toLowerCase()).filter(e => e));
      return uniqueEmails.size;
    }

    // Get unique student emails and names from filtered sessions (MESA sheet)
    const sessionStudentEmails = new Set<string>();
    const sessionStudentNames = new Set<string>();
    
    sessionsToUse.forEach(session => {
      const email = (session.studentEmail || '').trim().toLowerCase();
      const name = (session.studentName || '').trim().toLowerCase();
      if (email) sessionStudentEmails.add(email);
      if (name) sessionStudentNames.add(name);
    });

    // Match students from directory with sessions
    // Match by email (primary) or by name (fallback)
    const matchedStudents = new Set<string>();
    
    students.forEach(student => {
      const studentEmail = (student.email || '').trim().toLowerCase();
      const studentName = (student.name || '').trim().toLowerCase();
      
      // Match by email (exact match)
      if (studentEmail && sessionStudentEmails.has(studentEmail)) {
        matchedStudents.add(studentEmail);
        return;
      }
      
      // Match by name (case-insensitive, handle variations)
      if (studentName && sessionStudentNames.has(studentName)) {
        matchedStudents.add(studentEmail || studentName);
        return;
      }
      
      // Try partial name matching (first name + last name)
      if (studentName) {
        const nameParts = studentName.split(/\s+/).filter((p: string) => p.length > 0);
        if (nameParts.length > 0) {
          const firstName = nameParts[0].toLowerCase();
          const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase() : '';
          
          // Check if any session name matches
          for (const sessionName of sessionStudentNames) {
            const sessionNameParts = sessionName.split(/\s+/).filter((p: string) => p.length > 0);
            if (sessionNameParts.length > 0) {
              const sessionFirstName = sessionNameParts[0].toLowerCase();
              const sessionLastName = sessionNameParts.length > 1 ? sessionNameParts[sessionNameParts.length - 1].toLowerCase() : '';
              
              // Match if first and last names match
              if (firstName === sessionFirstName && lastName && sessionLastName && lastName === sessionLastName) {
                matchedStudents.add(studentEmail || studentName);
                break;
              }
            }
          }
        }
      }
    });

    return matchedStudents.size;
  }, [filteredSessionsForMetrics, sessions, hasData, students]);

  // Get unique students for filter
  const uniqueStudents = useMemo(() => {
    const studentMap = new Map<string, { email: string; name: string }>();
    sessions.forEach(session => {
      const email = session.studentEmail;
      if (email && email.trim()) {
        const normalizedEmail = email.trim().toLowerCase();
        if (!studentMap.has(normalizedEmail)) {
          studentMap.set(normalizedEmail, {
            email: email,
            name: session.studentName || email,
          });
        }
      }
    });
    return Array.from(studentMap.values()).sort((a, b) => a.name.localeCompare(b.name));
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
    
    if (selectedStudentFilter.length > 0) {
      const normalizedFilterEmails = selectedStudentFilter.map(e => (e || '').trim().toLowerCase()).filter(e => e);
      filteredSessions = filteredSessions.filter(s => {
        const sessionEmail = (s.studentEmail || '').trim().toLowerCase();
        return normalizedFilterEmails.includes(sessionEmail);
      });
    }
    
    // Exclude mentor-side disruptions for student dashboard analytics
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
  }, [sessions, hasData, weekFilter, monthFilter, selectedStudentFilter, candidateFeedbacks]);

  // Calculate additional metrics for new cards
  const top10BySessions = useMemo(() => {
    // Deduplicate by normalized email (case-insensitive)
    // candidateAnalytics should already be deduplicated, but we do it again for safety
    const uniqueCandidates = new Map<string, CandidateSessionStats>();
    
    candidateAnalytics.forEach(c => {
      // Only consider completed sessions for this ranking
      if (!c.completedSessions || c.completedSessions === 0) return;
      
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
        // If duplicate, keep the one with more completed sessions
        if (c.completedSessions > existing.completedSessions) {
          uniqueCandidates.set(key, c);
        } else if (c.completedSessions === existing.completedSessions) {
          // If same sessions, prefer the one with better data
          if ((c.email && !existing.email) || (c.name && !existing.name)) {
            uniqueCandidates.set(key, c);
          }
        }
      }
    });
    
    const sorted = Array.from(uniqueCandidates.values())
      .sort((a, b) => {
        // First sort by completedSessions (descending)
        if (b.completedSessions !== a.completedSessions) {
          return b.completedSessions - a.completedSessions;
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
      // Only consider candidates who have at least 1 completed session
      if (!c.completedSessions || c.completedSessions === 0) return;
      
      const existing = uniqueCandidates.get(normalizedEmail);
      if (!existing || c.completedSessions < existing.completedSessions) {
        uniqueCandidates.set(normalizedEmail, c);
      }
    });
    
    const sorted = Array.from(uniqueCandidates.values())
      .sort((a, b) => {
        // First sort by completedSessions (ascending)
        if (a.completedSessions !== b.completedSessions) {
          return a.completedSessions - b.completedSessions;
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
    
    // Apply student filter if selected
    if (selectedStudentFilter.length > 0) {
      const normalizedFilterEmails = selectedStudentFilter.map(e => (e || '').trim().toLowerCase()).filter(e => e);
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
  }, [candidateAnalytics, searchTerm, selectedStudentFilter]);

  const handleStudentClick = (candidate: CandidateSessionStats) => {
    setSelectedStudent(candidate);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedStudent(null);
  };

  const studentSessions = useMemo(() => {
    if (!selectedStudent) return [];
    return sessions.filter(s => (s.studentEmail || '').trim().toLowerCase() === (selectedStudent.email || '').trim().toLowerCase());
  }, [selectedStudent, sessions]);

  const loggedInStudentName = useMemo(() => {
    if (!isPersonalStudent) return null;
    const email = (loggedInEmail || '').trim().toLowerCase();
    const fromSession = sessions.find(s => (s.studentEmail || '').trim().toLowerCase() === email);
    const name = (fromSession?.studentName || '').trim();
    if (name) return name;
    if (email) return email.split('@')[0];
    return 'Student';
  }, [isPersonalStudent, loggedInEmail, sessions]);

  const personalCandidateAnalytics = useMemo(() => {
    if (!isPersonalStudent) return null;
    const email = (loggedInEmail || '').trim().toLowerCase();
    if (!email) return null;
    // candidateAnalytics should already be filtered by selectedStudentFilter, but this is extra safety.
    const exact = candidateAnalytics.find(c => (c.email || '').trim().toLowerCase() === email);
    return exact || candidateAnalytics[0] || null;
  }, [isPersonalStudent, loggedInEmail, candidateAnalytics]);

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
        setMentorFeedbacks(result.data.mentorFeedbacks || []);
      }
    } catch (error) {
      // Silent error handling
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
    
    // Apply student filter
    if (selectedStudentFilter.length > 0) {
      const normalizedFilterEmails = selectedStudentFilter.map(e => (e || '').trim().toLowerCase()).filter(e => e);
      filteredSessions = filteredSessions.filter(s => {
        const sessionEmail = (s.studentEmail || '').trim().toLowerCase();
        return normalizedFilterEmails.includes(sessionEmail);
      });
    }
    
    // Exclude mentor-side disruptions for student dashboard
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
  }, [sessions, hasData, weekFilter, monthFilter, selectedStudentFilter]);

  if (!hasData || !studentMetrics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <AlertCircle className="w-16 h-16 text-gray-400 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">No Data Available</h2>
        <p className="text-gray-300 mb-6 text-center max-w-md">
          {sessions.length === 0 
            ? 'No valid session data found. Please ensure your Google Sheet has data with Date, Mentor Email, and Student Email fields filled in.'
            : 'Please upload your session data first'}
        </p>
        <div className="flex gap-4">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-6 py-3 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            style={{ backgroundColor: isRefreshing ? '#3A5A5A' : '#22C55E' }}
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Loading...' : 'Reload Data'}
          </button>
          <Link
            href="/"
            className="px-6 py-3 text-white rounded-lg transition-colors"
            style={{ backgroundColor: '#3A5A5A' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2A4A4A'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3A5A5A'}
          >
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  // Personal student view (logged-in student account)
  if (isPersonalStudent) {
    const disruptions =
      (studentMetrics.totalSessionsCancelled || 0) +
      (studentMetrics.totalSessionsRescheduled || 0) +
      (studentMetrics.totalNoShows || 0);

    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white">Hello {loggedInStudentName}</h1>
          <p className="text-gray-300">Performance analytics</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <MetricCard
            title="Total Sessions Done"
            value={studentMetrics.totalSessionsDone}
            icon={CheckCircle}
            iconColor="text-[#22C55E]"
            subtitle="Completed sessions"
          />
          <MetricCard
            title="Disruptions"
            value={disruptions}
            icon={XCircle}
            iconColor="text-red-500"
            subtitle="Cancelled / rescheduled / no-show"
          />
          <MetricCard
            title="Avg. Rating"
            value={studentMetrics.avgFeedbackScore > 0 ? studentMetrics.avgFeedbackScore.toFixed(2) : 'N/A'}
            icon={Star}
            iconColor="text-[#22C55E]"
            subtitle="Across your sessions"
          />
        </div>

        {/* Weekwise Sessions Booked */}
        <div className="rounded-xl shadow-md p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Weekwise Sessions Booked</h3>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: isRefreshing ? '#3A5A5A' : '#22C55E',
                color: '#fff',
              }}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
            </button>
          </div>

          {weekwiseSessionData.length === 0 ? (
            <div className="flex items-center justify-center h-[260px]">
              <p className="text-gray-400">No session data available</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={weekwiseSessionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3A5A5A" />
                <XAxis dataKey="week" stroke="#86EFAC" tick={{ fill: '#86EFAC', fontSize: 12 }} />
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
                <Line type="monotone" dataKey="sessions" stroke="#22C55E" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Session Logs */}
        <div className="rounded-xl shadow-md border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
          <div className="p-6 border-b" style={{ borderColor: '#3A5A5A' }}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Session Logs</h3>
                <p className="text-xs text-gray-400 mt-1">Click on a session to view detailed feedback</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b" style={{ backgroundColor: '#1A3636', borderColor: '#3A5A5A' }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Mentor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ backgroundColor: '#2A4A4A' }}>
                {(() => {
                  // Get personal student sessions sorted by date (most recent first)
                  const email = (loggedInEmail || '').trim().toLowerCase();
                  const personalSessions = sessions
                    .filter(s => {
                      const sessionEmail = (s.studentEmail || '').trim().toLowerCase();
                      if (sessionEmail !== email) return false;
                      // Filter out mentor-side disruptions
                      const normalized = normalizeSessionStatus(s.sessionStatus);
                      return (
                        normalized !== 'mentor_cancelled' &&
                        normalized !== 'mentor_no_show' &&
                        normalized !== 'mentor_rescheduled' &&
                        normalized !== 'admin_cancelled' &&
                        normalized !== 'admin_rescheduled'
                      );
                    })
                    .sort((a, b) => {
                      const dateA = parseSessionDate(a.date);
                      const dateB = parseSessionDate(b.date);
                      if (!dateA || !dateB) return 0;
                      return dateB.getTime() - dateA.getTime();
                    });

                  if (personalSessions.length === 0) {
                    return (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                          No sessions found
                        </td>
                      </tr>
                    );
                  }

                  // Helper function to get feedback rating for a session
                  const getSessionRating = (session: Session): number | null => {
                    // First try candidateFeedbacks
                    if (candidateFeedbacks && candidateFeedbacks.length > 0) {
                      const sessionDate = session.date;
                      const mentorName = (session.mentorName || '').trim();
                      const candidateName = (session.studentName || '').trim();
                      const candidateEmail = (session.studentEmail || '').trim();
                      const sessionDateParsed = parseSessionDate(sessionDate);

                      const matchedFeedback = candidateFeedbacks.find(feedback => {
                        const feedbackDate = feedback['Session Date'] || feedback['sessionDate'] || feedback['Date'] || feedback['date'] || '';
                        const feedbackMentorName = (feedback['Mentor Name'] || feedback['mentorName'] || feedback['Mentor'] || feedback['mentor'] || '').trim();
                        const feedbackCandidateName = (feedback['Candidate Name'] || feedback['candidateName'] || feedback['Candidate'] || feedback['candidate'] || feedback['Mentee Name'] || feedback['menteeName'] || '').trim();
                        const feedbackCandidateEmail = (feedback['Candidate Email'] || feedback['candidateEmail'] || feedback['Candidate Email ID'] || feedback['Mentee Email'] || feedback['menteeEmail'] || '').trim();

                        const normalizedCandidateName = candidateName.toLowerCase().trim();
                        const normalizedCandidateEmail = candidateEmail.toLowerCase().trim();
                        const normalizedMentorName = mentorName.toLowerCase().trim();
                        const normalizedFeedbackCandidateName = feedbackCandidateName.toLowerCase().trim();
                        const normalizedFeedbackCandidateEmail = feedbackCandidateEmail.toLowerCase().trim();
                        const normalizedFeedbackMentorName = feedbackMentorName.toLowerCase().trim();

                        const candidateMatch =
                          (normalizedCandidateName && normalizedFeedbackCandidateName && normalizedFeedbackCandidateName === normalizedCandidateName) ||
                          (normalizedCandidateEmail && normalizedFeedbackCandidateEmail && normalizedFeedbackCandidateEmail === normalizedCandidateEmail);

                        const mentorMatch =
                          normalizedMentorName && normalizedFeedbackMentorName && (
                            normalizedFeedbackMentorName === normalizedMentorName ||
                            normalizedFeedbackMentorName.includes(normalizedMentorName) ||
                            normalizedMentorName.includes(normalizedFeedbackMentorName)
                          );

                        let dateMatch = false;
                        if (sessionDateParsed && feedbackDate) {
                          const feedbackDateParsed = parseSessionDate(feedbackDate);
                          if (feedbackDateParsed && sessionDateParsed) {
                            dateMatch =
                              sessionDateParsed.getFullYear() === feedbackDateParsed.getFullYear() &&
                              sessionDateParsed.getMonth() === feedbackDateParsed.getMonth() &&
                              sessionDateParsed.getDate() === feedbackDateParsed.getDate();
                          }
                        }

                        return candidateMatch && (dateMatch || mentorMatch);
                      });

                      if (matchedFeedback) {
                        let averageValue = matchedFeedback['Overall Rating'] ||
                          matchedFeedback['overall rating'] ||
                          matchedFeedback['Overall rating'] ||
                          matchedFeedback['overallRating'] ||
                          matchedFeedback['Average'] ||
                          matchedFeedback['average'];

                        if (!averageValue || averageValue === null || averageValue === undefined || averageValue === '') {
                          const allKeys = Object.keys(matchedFeedback);
                          if (allKeys.length > 11) {
                            averageValue = matchedFeedback[allKeys[11]];
                          }
                        }

                        if (averageValue !== null && averageValue !== undefined && averageValue !== '') {
                          const avgRating = parseFloat(String(averageValue));
                          if (!isNaN(avgRating) && avgRating > 0 && avgRating <= 5) {
                            return avgRating;
                          }
                        }
                      }
                    }

                    // Fallback to session.mentorFeedback
                    if (session.mentorFeedback) {
                      const value = typeof session.mentorFeedback === 'number'
                        ? session.mentorFeedback
                        : parseFloat(String(session.mentorFeedback));
                      if (!isNaN(value) && value > 0 && value <= 5) {
                        return value;
                      }
                    }

                    return null;
                  };

                  // Helper function to get full feedback object for expanded view
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const getFullFeedback = (session: Session): any | null => {
                    if (!candidateFeedbacks || candidateFeedbacks.length === 0) return null;

                    const sessionDate = session.date;
                    const mentorName = (session.mentorName || '').trim();
                    const candidateName = (session.studentName || '').trim();
                    const candidateEmail = (session.studentEmail || '').trim();
                    const sessionDateParsed = parseSessionDate(sessionDate);

                    const matchedFeedback = candidateFeedbacks.find(feedback => {
                      const feedbackDate = feedback['Session Date'] || feedback['sessionDate'] || feedback['Date'] || feedback['date'] || '';
                      const feedbackMentorName = (feedback['Mentor Name'] || feedback['mentorName'] || feedback['Mentor'] || feedback['mentor'] || '').trim();
                      const feedbackCandidateName = (feedback['Candidate Name'] || feedback['candidateName'] || feedback['Candidate'] || feedback['candidate'] || feedback['Mentee Name'] || feedback['menteeName'] || '').trim();
                      const feedbackCandidateEmail = (feedback['Candidate Email'] || feedback['candidateEmail'] || feedback['Candidate Email ID'] || feedback['Mentee Email'] || feedback['menteeEmail'] || '').trim();

                      const normalizedCandidateName = candidateName.toLowerCase().trim();
                      const normalizedCandidateEmail = candidateEmail.toLowerCase().trim();
                      const normalizedMentorName = mentorName.toLowerCase().trim();
                      const normalizedFeedbackCandidateName = feedbackCandidateName.toLowerCase().trim();
                      const normalizedFeedbackCandidateEmail = feedbackCandidateEmail.toLowerCase().trim();
                      const normalizedFeedbackMentorName = feedbackMentorName.toLowerCase().trim();

                      const candidateMatch =
                        (normalizedCandidateName && normalizedFeedbackCandidateName && normalizedFeedbackCandidateName === normalizedCandidateName) ||
                        (normalizedCandidateEmail && normalizedFeedbackCandidateEmail && normalizedFeedbackCandidateEmail === normalizedCandidateEmail);

                      const mentorMatch =
                        normalizedMentorName && normalizedFeedbackMentorName && (
                          normalizedFeedbackMentorName === normalizedMentorName ||
                          normalizedFeedbackMentorName.includes(normalizedMentorName) ||
                          normalizedMentorName.includes(normalizedFeedbackMentorName)
                        );

                      let dateMatch = false;
                      if (sessionDateParsed && feedbackDate) {
                        const feedbackDateParsed = parseSessionDate(feedbackDate);
                        if (feedbackDateParsed && sessionDateParsed) {
                          dateMatch =
                            sessionDateParsed.getFullYear() === feedbackDateParsed.getFullYear() &&
                            sessionDateParsed.getMonth() === feedbackDateParsed.getMonth() &&
                            sessionDateParsed.getDate() === feedbackDateParsed.getDate();
                        }
                      }

                      return candidateMatch && (dateMatch || mentorMatch);
                    });

                    return matchedFeedback || null;
                  };

                  return personalSessions.map((session, index) => {
                    const rating = getSessionRating(session);
                    const isExpanded = expandedSessionIndex === index;
                    const fullFeedback = isExpanded ? getFullFeedback(session) : null;

                    const rawStatus = (session.sessionStatus && String(session.sessionStatus).trim())
                      ? session.sessionStatus
                      : 'Upcoming';
                    const displayStatus = rawStatus.toLowerCase() === 'unknown' ? 'Upcoming' : rawStatus;

                    return (
                      <React.Fragment key={index}>
                        <tr
                          className="transition-colors cursor-pointer"
                          style={{ borderColor: '#3A5A5A' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1A3636'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2A4A4A'}
                          onClick={() => setExpandedSessionIndex(isExpanded ? null : index)}
                        >
                          <td className="px-6 py-4 text-sm text-white">
                            {(() => {
                              const parsedDate = parseSessionDate(session.date);
                              if (parsedDate) {
                                return format(parsedDate, 'MMM dd, yyyy');
                              }
                              return session.date;
                            })()}
                          </td>
                          <td className="px-6 py-4">
                            {session.sessionType ? (
                              <span className="px-2 py-1 text-xs rounded-full text-white" style={{
                                backgroundColor: session.sessionType.toLowerCase() === 'assessment' ? '#F59E0B' : '#22C55E'
                              }}>
                                {session.sessionType}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">N/A</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-white">{session.mentorName || 'N/A'}</td>
                          <td className="px-6 py-4 text-sm text-gray-300">{session.time || 'N/A'}</td>
                          <td className="px-6 py-4">
                            {rating !== null ? (
                              <div className="flex items-center space-x-1">
                                <Star className="w-4 h-4 text-[#86EFAC]" />
                                <span className="text-sm text-white">{rating.toFixed(1)}</span>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">N/A</span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={5} className="px-6 py-4" style={{ backgroundColor: '#1A3636' }}>
                              <div className="space-y-4">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-md font-semibold text-white">Session Details</h4>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedSessionIndex(null);
                                    }}
                                    className="text-gray-400 hover:text-white"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>

                                {/* Session Information */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                                  <div className="p-3 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                    <p className="text-xs text-gray-400 mb-1">Date</p>
                                    <p className="text-sm text-white">
                                      {(() => {
                                        const parsedDate = parseSessionDate(session.date);
                                        if (parsedDate) {
                                          return format(parsedDate, 'MMM dd, yyyy');
                                        }
                                        return session.date;
                                      })()}
                                    </p>
                                  </div>
                                  <div className="p-3 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                    <p className="text-xs text-gray-400 mb-1">Time</p>
                                    <p className="text-sm text-white">{session.time || 'N/A'}</p>
                                  </div>
                                  <div className="p-3 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                    <p className="text-xs text-gray-400 mb-1">Mentor</p>
                                    <p className="text-sm text-white">{session.mentorName || 'N/A'}</p>
                                  </div>
                                  <div className="p-3 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                    <p className="text-xs text-gray-400 mb-1">Status</p>
                                    <div className="flex items-center space-x-2">
                                      {displayStatus.toLowerCase() === 'completed' ? (
                                        <CheckCircle className="w-4 h-4 text-[#22C55E]" />
                                      ) : displayStatus.toLowerCase() === 'cancelled' ? (
                                        <XCircle className="w-4 h-4 text-red-400" />
                                      ) : displayStatus.toLowerCase().includes('no show') ? (
                                        <AlertCircle className="w-4 h-4 text-orange-400" />
                                      ) : (
                                        <AlertCircle className="w-4 h-4 text-gray-400" />
                                      )}
                                      <span className={`text-sm ${
                                        displayStatus.toLowerCase() === 'completed' ? 'text-[#22C55E]' :
                                        displayStatus.toLowerCase() === 'cancelled' ? 'text-red-400' :
                                        displayStatus.toLowerCase().includes('no show') ? 'text-orange-400' :
                                        'text-gray-400'
                                      }`}>
                                        {displayStatus}
                                      </span>
                                    </div>
                                  </div>
                                  {session.sessionType && (
                                    <div className="p-3 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                      <p className="text-xs text-gray-400 mb-1">Session Type</p>
                                      <span className="px-2 py-1 text-xs rounded-full text-white" style={{
                                        backgroundColor: session.sessionType.toLowerCase() === 'assessment' ? '#F59E0B' : '#22C55E'
                                      }}>
                                        {session.sessionType}
                                      </span>
                                    </div>
                                  )}
                                  {session.inviteTitle && (
                                    <div className="p-3 rounded-lg md:col-span-2" style={{ backgroundColor: '#2A4A4A' }}>
                                      <p className="text-xs text-gray-400 mb-1">Session Title</p>
                                      <p className="text-sm text-white">{session.inviteTitle}</p>
                                    </div>
                                  )}
                                </div>

                                {/* Feedback Section */}
                                {fullFeedback ? (
                                  <div className="border-t pt-4 mt-4" style={{ borderColor: '#3A5A5A' }}>
                                    <h5 className="text-sm font-semibold text-white mb-3">Feedback Details</h5>
                                    
                                    {/* Overall Rating */}
                                    {(() => {
                                      const overallRating = fullFeedback['Overall Rating'] || fullFeedback['overall rating'] || fullFeedback['Average'] || fullFeedback['average'];
                                      if (overallRating) {
                                        return (
                                          <div className="flex items-center space-x-2 mb-3 p-3 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                            <Star className="w-5 h-5 text-[#22C55E]" />
                                            <span className="text-lg font-bold text-white">
                                              Overall Rating: {parseFloat(String(overallRating)).toFixed(2)}
                                            </span>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}

                                    {/* Case and Difficulty */}
                                    {((fullFeedback['Case'] || fullFeedback['case']) || (fullFeedback['Difficulty'] || fullFeedback['difficulty'])) && (
                                      <div className="grid grid-cols-2 gap-3 mb-3">
                                        {(fullFeedback['Case'] || fullFeedback['case']) && (
                                          <div className="p-3 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                            <p className="text-xs text-gray-400 mb-1">Case</p>
                                            <p className="text-sm text-white">{String(fullFeedback['Case'] || fullFeedback['case'])}</p>
                                          </div>
                                        )}
                                        {(fullFeedback['Difficulty'] || fullFeedback['difficulty']) && (
                                          <div className="p-3 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                            <p className="text-xs text-gray-400 mb-1">Difficulty</p>
                                            <p className="text-sm text-white">{String(fullFeedback['Difficulty'] || fullFeedback['difficulty'])}</p>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Rating Parameters */}
                                    <div className="space-y-2 mb-3">
                                      <p className="text-sm font-semibold text-white mb-2">Rating Parameters:</p>
                                      {[
                                        { key: 'Rating on scoping questions', label: 'Scoping Questions' },
                                        { key: 'Rating on case setup and structure ', label: 'Case Setup & Structure' },
                                        { key: 'Rating on quantitative ability (if not tested, rate 1)', label: 'Quantitative Ability' },
                                        { key: 'Rating on communication and confidence', label: 'Communication & Confidence' },
                                        { key: 'Rating on business acumen and creativity', label: 'Business Acumen & Creativity' },
                                      ].map(({ key, label }) => {
                                        const ratingValue = fullFeedback[key];
                                        if (!ratingValue && ratingValue !== 0) return null;
                                        const ratingNum = parseFloat(String(ratingValue));
                                        if (isNaN(ratingNum)) return null;

                                        return (
                                          <div key={key} className="flex items-center justify-between p-2 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                            <span className="text-sm text-gray-300">{label}</span>
                                            <div className="flex items-center space-x-2">
                                              <Star className="w-4 h-4 text-[#86EFAC]" />
                                              <span className="text-sm font-medium text-white">{ratingNum.toFixed(1)}</span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>

                                    {/* Comments */}
                                    {(fullFeedback['Overall strength and areas of improvement'] ||
                                      fullFeedback['Comments'] ||
                                      fullFeedback['comments']) && (
                                        <div className="p-3 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                          <p className="text-sm font-semibold text-white mb-2">Overall Strength and Areas of Improvement:</p>
                                          <p className="text-sm text-gray-300 whitespace-pre-wrap">
                                            {String(fullFeedback['Overall strength and areas of improvement'] ||
                                              fullFeedback['Comments'] ||
                                              fullFeedback['comments'])}
                                          </p>
                                        </div>
                                      )}
                                  </div>
                                ) : (
                                  <div className="border-t pt-4 mt-4" style={{ borderColor: '#3A5A5A' }}>
                                    <div className="p-3 rounded-lg text-center" style={{ backgroundColor: '#2A4A4A' }}>
                                      <p className="text-sm text-gray-400">No feedback available for this session</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Modal */}
        {selectedStudent && (
          <DetailModal
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            type="student"
            name={selectedStudent.name}
            email={selectedStudent.email}
            phone={sessions.find(s => (s.studentEmail || '').trim().toLowerCase() === (selectedStudent.email || '').trim().toLowerCase())?.studentPhone}
            sessions={studentSessions}
            candidateFeedbacks={candidateFeedbacks}
          />
        )}
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
          {/* Student Filter - Multi-select */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-300 whitespace-nowrap">Student:</label>
            <StudentMultiSelect
              students={uniqueStudents}
              selectedStudents={selectedStudentFilter}
              onChange={setSelectedStudentFilter}
            />
          </div>
        </div>
      </div>

      {/* Primary Metrics - 3 cards per row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricCard
          title="Total Sessions Done"
          value={studentMetrics.totalSessionsDone}
          icon={Calendar}
          iconColor="text-[#22C55E]"
          subtitle="Completed sessions"
        />
        <MetricCard
          title="# of Unique Candidates"
          value={uniqueCandidatesWithSessions}
          icon={Users}
          iconColor="text-[#22C55E]"
          subtitle="Candidates from Student Directory who booked sessions"
        />
        <MetricCard
          title="Avg Sessions Per Candidate"
          value={(() => {
            // Formula: Total Sessions Done (filtered) / Total Candidates (from Student Directory)
            if (!hasData || !students || students.length === 0 || !studentMetrics) {
              return 'N/A';
            }
            
            // Use filtered sessions count from studentMetrics (already filtered by week/month/student)
            const totalSessionsDone = studentMetrics.totalSessionsDone;
            const totalCandidates = students.length;
            return totalSessionsDone > 0 
              ? (totalSessionsDone / totalCandidates).toFixed(2)
              : '0.00';
          })()}
          icon={TrendingUp}
          iconColor="text-[#22C55E]"
          subtitle="Total Sessions Done (filtered) / Total Candidates (from Student Directory)"
        />
        <MetricCard
          title="Avg Sessions Per Active Candidate"
          value={(() => {
            // Formula: Total Sessions Done (filtered) / Candidates with at least 1 session in filtered range (who are in Student Directory)
            if (!hasData || !students || students.length === 0 || !studentMetrics) {
              return 'N/A';
            }
            
            // Use filtered sessions count from studentMetrics (already filtered by week/month/student)
            const totalSessionsDone = studentMetrics.totalSessionsDone;
            
            // Get unique student names from filtered sessions (who have booked at least 1 session in the filtered range)
            const filteredCompletedSessions = filteredSessionsForMetrics.filter(
              s => normalizeSessionStatus(s.sessionStatus) === 'completed'
            );
            
            const sessionStudentNames = new Set(
              filteredCompletedSessions
                .map(s => (s.studentName || '').trim().toLowerCase())
                .filter(name => name)
            );
            
            // Count how many candidates from Student Directory have booked at least 1 session in the filtered range
            const activeCandidatesCount = students.filter(student => {
              const studentName = (student.name || '').trim().toLowerCase();
              return studentName && sessionStudentNames.has(studentName);
            }).length;
            
            return activeCandidatesCount > 0 
              ? (totalSessionsDone / activeCandidatesCount).toFixed(2)
              : '0.00';
          })()}
          icon={TrendingUp}
          iconColor="text-[#22C55E]"
          subtitle="Total Sessions Done (filtered) / Active Candidates (from Student Directory)"
        />
        <MetricCard
          title="Total Sessions Cancelled / Rescheduled / No Show"
          value={
            studentMetrics.totalSessionsCancelled +
            studentMetrics.totalSessionsRescheduled +
            studentMetrics.totalNoShows
          }
          icon={XCircle}
          iconColor="text-red-500"
          subtitle="Disruptions"
        />
        <MetricCard
          title="Avg. Rating"
          value={studentMetrics.avgFeedbackScore > 0 ? studentMetrics.avgFeedbackScore.toFixed(2) : 'N/A'}
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
                    onClick={() => handleStudentClick(candidate)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-[#22C55E] w-6">#{index + 1}</span>
                      <div>
                        <p className="text-sm font-medium text-white">{candidate.name || candidate.email}</p>
                        <p className="text-xs text-gray-400">{candidate.completedSessions} sessions done</p>
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
                  onClick={() => handleStudentClick(candidate)}
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
                  onClick={() => handleStudentClick(candidate)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-orange-500 w-6">#{index + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-white">{candidate.name || candidate.email}</p>
                      <p className="text-xs text-gray-400">{candidate.completedSessions} sessions done</p>
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
                  onClick={() => handleStudentClick(candidate)}
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

      {/* Individual Student Analytics Table */}
      <div className="rounded-xl shadow-md border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
        <div className="p-6 border-b" style={{ borderColor: '#3A5A5A' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Individual Student Analytics</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search students..."
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
                  Student Details
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
                  onClick={() => handleStudentClick(candidate)}
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
      {selectedStudent && (
        <DetailModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          type="student"
          name={selectedStudent.name}
          email={selectedStudent.email}
          phone={sessions.find(s => s.studentEmail === selectedStudent.email)?.studentPhone}
          sessions={studentSessions}
          candidateFeedbacks={candidateFeedbacks}
        />
      )}
    </div>
  );
}

