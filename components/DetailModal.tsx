'use client';

import React from 'react';
import { X, Calendar, Clock, Star, CheckCircle, XCircle, AlertCircle, Mail, Phone } from 'lucide-react';
import { Session } from '@/types';
import { parseISO, format } from 'date-fns';
import { normalizeSessionStatus, parseSessionDate } from '@/utils/metricsCalculator';

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'mentor' | 'student';
  name: string;
  email: string;
  phone?: string;
  sessions: Session[];
  candidateFeedbacks?: any[];
}

export const DetailModal: React.FC<DetailModalProps> = ({
  isOpen,
  onClose,
  type,
  name,
  email,
  phone,
  sessions,
  candidateFeedbacks = [],
}) => {
  const [selectedSessionIndex, setSelectedSessionIndex] = React.useState<number | null>(null);
  
  if (!isOpen) return null;

  // Filter out mentor-side disruptions for student dashboard
  // Student dashboard should only show student-side disruptions, not mentor-side ones
  const filteredSessions = React.useMemo(() => {
    if (type === 'student') {
      return sessions.filter(s => {
        const normalized = normalizeSessionStatus(s.sessionStatus);
        // Exclude mentor-side disruptions
        return (
          normalized !== 'mentor_cancelled' &&
          normalized !== 'mentor_no_show' &&
          normalized !== 'mentor_rescheduled' &&
          normalized !== 'admin_cancelled' &&
          normalized !== 'admin_rescheduled'
        );
      });
    }
    return sessions;
  }, [sessions, type]);

  // Sort sessions by date (most recent first)
  const sortedSessions = [...filteredSessions].sort((a, b) => {
    try {
      const dateA = parseISO(a.date);
      const dateB = parseISO(b.date);
      return dateB.getTime() - dateA.getTime();
    } catch {
      return 0;
    }
  });

  const lastSession = sortedSessions[0];
  const completedSessions = sortedSessions.filter(s => s.sessionStatus?.toLowerCase() === 'completed');
  
  // Helper function to get full feedback object for a session (for students)
  const getFullSessionFeedback = React.useCallback((session: Session): any | null => {
    if (type === 'student' && candidateFeedbacks && candidateFeedbacks.length > 0) {
      const sessionDate = session.date;
      const mentorName = (session.mentorName || '').trim();
      const candidateName = (session.studentName || name || '').trim();
      const candidateEmail = (session.studentEmail || email || '').trim();

      // Use parseSessionDate which handles MM/DD/YYYY format
      const sessionDateParsed = parseSessionDate(sessionDate);

      const matchedFeedback = candidateFeedbacks.find(feedback => {
        // Try multiple column name variations
        const feedbackDate = feedback['Session Date'] || feedback['sessionDate'] || feedback['Date'] || feedback['date'] || '';
        const feedbackMentorName = (feedback['Mentor Name'] || feedback['mentorName'] || feedback['Mentor'] || feedback['mentor'] || '').trim();
        const feedbackCandidateName = (feedback['Candidate Name'] || feedback['candidateName'] || feedback['Candidate'] || feedback['candidate'] || feedback['Mentee Name'] || feedback['menteeName'] || '').trim();
        const feedbackCandidateEmail = (feedback['Candidate Email'] || feedback['candidateEmail'] || feedback['Candidate Email ID'] || feedback['Mentee Email'] || feedback['menteeEmail'] || '').trim();

        // Normalize for comparison
        const normalizedCandidateName = candidateName.toLowerCase().trim();
        const normalizedCandidateEmail = candidateEmail.toLowerCase().trim();
        const normalizedMentorName = mentorName.toLowerCase().trim();
        const normalizedFeedbackCandidateName = feedbackCandidateName.toLowerCase().trim();
        const normalizedFeedbackCandidateEmail = feedbackCandidateEmail.toLowerCase().trim();
        const normalizedFeedbackMentorName = feedbackMentorName.toLowerCase().trim();

        // Match by candidate name or email (flexible matching)
        const candidateMatch = 
          (normalizedCandidateName && normalizedFeedbackCandidateName && normalizedFeedbackCandidateName === normalizedCandidateName) ||
          (normalizedCandidateEmail && normalizedFeedbackCandidateEmail && normalizedFeedbackCandidateEmail === normalizedCandidateEmail) ||
          // Partial name matching (first name + last name)
          (normalizedCandidateName && normalizedFeedbackCandidateName && 
           normalizedCandidateName.split(/\s+/)[0] === normalizedFeedbackCandidateName.split(/\s+/)[0] &&
           normalizedCandidateName.split(/\s+/).pop() === normalizedFeedbackCandidateName.split(/\s+/).pop());

        // Match by mentor name (flexible - partial match allowed)
        const mentorMatch = 
          normalizedMentorName && normalizedFeedbackMentorName && (
            normalizedFeedbackMentorName === normalizedMentorName ||
            normalizedFeedbackMentorName.includes(normalizedMentorName) ||
            normalizedMentorName.includes(normalizedFeedbackMentorName) ||
            // First name match
            normalizedMentorName.split(/\s+/)[0] === normalizedFeedbackMentorName.split(/\s+/)[0]
          );

        // Match by date (use parseSessionDate for both)
        let dateMatch = false;
        if (sessionDateParsed && feedbackDate) {
          const feedbackDateParsed = parseSessionDate(feedbackDate);
          if (feedbackDateParsed && sessionDateParsed) {
            // Compare dates (same day)
            dateMatch = 
              sessionDateParsed.getFullYear() === feedbackDateParsed.getFullYear() &&
              sessionDateParsed.getMonth() === feedbackDateParsed.getMonth() &&
              sessionDateParsed.getDate() === feedbackDateParsed.getDate();
          }
        }

        // Match if: candidate matches AND (date matches OR mentor matches OR both dates are missing)
        // This is more flexible - if candidate and date match, mentor match is optional
        // If candidate and mentor match, date match is optional
        // Also allow match if candidate matches and we can't parse dates (fallback)
        const hasCandidateMatch = candidateMatch;
        const hasDateOrMentorMatch = dateMatch || mentorMatch || (!sessionDateParsed && !feedbackDate);
        
        // If candidate matches but no date/mentor match, still try if dates can't be parsed
        if (hasCandidateMatch && !hasDateOrMentorMatch && !sessionDateParsed && !feedbackDate) {
          return true; // Fallback: match by candidate only if dates can't be parsed
        }
        
        return hasCandidateMatch && hasDateOrMentorMatch;
      });

      return matchedFeedback || null;
    }
    return null;
  }, [type, name, email, candidateFeedbacks]);

  // Helper function to match session with candidate feedback from candidateFeedbacks sheet (returns just average)
  const getSessionFeedbackFromSheet = React.useCallback((session: Session): number | null => {
    // Use the full feedback function and extract average
    const fullFeedback = getFullSessionFeedback(session);
    if (fullFeedback) {
      // Try multiple column name variations - use "Overall Rating" from column L
      let averageValue = fullFeedback['Overall Rating'] || 
                        fullFeedback['overall rating'] || 
                        fullFeedback['Overall rating'] ||
                        fullFeedback['overallRating'] ||
                        fullFeedback['Average'] || 
                        fullFeedback['average'];
      
      // If not found by name, try to find by column position (Column L = index 11)
      if (!averageValue || averageValue === null || averageValue === undefined || averageValue === '') {
        const allKeys = Object.keys(fullFeedback);
        if (allKeys.length > 11) {
          averageValue = fullFeedback[allKeys[11]]; // Column L (0-indexed: 11)
        }
      }
      
      if (averageValue !== null && averageValue !== undefined && averageValue !== '') {
        const avgRating = parseFloat(String(averageValue));
        if (!isNaN(avgRating) && avgRating > 0 && avgRating <= 5) {
          return avgRating;
        }
      }
    }
    return null;
  }, [getFullSessionFeedback]);

  // Get recent feedbacks - for students, also check candidateFeedbacks
  const recentFeedbacks = React.useMemo(() => {
    const feedbacks = sortedSessions
      .map(s => {
        let hasFeedback = false;
        if (type === 'mentor') {
          const feedbackValue = String(s.studentFeedback || '');
          hasFeedback = feedbackValue !== '' && feedbackValue !== 'N/A' && feedbackValue !== 'null' && feedbackValue !== 'undefined';
        } else {
          // For mentees, check both session.mentorFeedback and candidateFeedbacks
          const feedbackValue = String(s.mentorFeedback || '');
          if (feedbackValue !== '' && feedbackValue !== 'N/A' && feedbackValue !== 'null' && feedbackValue !== 'undefined') {
            hasFeedback = true;
          } else if (candidateFeedbacks && candidateFeedbacks.length > 0) {
            const matchedFeedback = getSessionFeedbackFromSheet(s);
            hasFeedback = matchedFeedback !== null;
          }
        }
        return hasFeedback ? s : null;
      })
      .filter((s): s is Session => s !== null)
      .slice(0, 5);
    return feedbacks;
  }, [sortedSessions, type, candidateFeedbacks, getSessionFeedbackFromSheet]);

  // Calculate average ratings per parameter for students from Candidate Feedback sheet
  const candidateAverageRatings = React.useMemo(() => {
    if (type !== 'student' || !candidateFeedbacks || candidateFeedbacks.length === 0) {
      return null;
    }

    // Filter feedbacks for this candidate
    const candidateFeedbacksFiltered = candidateFeedbacks.filter(feedback => {
      const candidateName = (feedback['Candidate Name'] || '').toLowerCase().trim();
      const candidateEmail = (feedback['Candidate Email'] || '').toLowerCase().trim();
      const nameMatch = name.toLowerCase().trim() === candidateName;
      const emailMatch = email.toLowerCase().trim() === candidateEmail;
      return nameMatch || emailMatch;
    });

    if (candidateFeedbacksFiltered.length === 0) {
      return null;
    }

    // Rating parameter columns
    const ratingColumns = [
      { key: 'Rating on scoping questions', label: 'Scoping Questions' },
      { key: 'Rating on case setup and structure ', label: 'Case Setup & Structure' },
      { key: 'Rating on quantitative ability (if not tested, rate 1)', label: 'Quantitative Ability' },
      { key: 'Rating on communication and confidence', label: 'Communication & Confidence' },
      { key: 'Rating on business acumen and creativity', label: 'Business Acumen & Creativity' },
    ];

    // Calculate average for each parameter
    const averages: { label: string; average: number; count: number }[] = [];
    let overallAverage = 0;
    let overallCount = 0;

    ratingColumns.forEach(({ key, label }) => {
      const ratings: number[] = [];
      candidateFeedbacksFiltered.forEach(feedback => {
        const value = feedback[key];
        if (value !== null && value !== undefined && value !== '') {
          const rating = parseFloat(String(value));
          if (!isNaN(rating) && rating > 0 && rating <= 5) {
            ratings.push(rating);
          }
        }
      });

      if (ratings.length > 0) {
        const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
        averages.push({ label, average: avg, count: ratings.length });
        overallAverage += avg;
        overallCount++;
      }
    });

    return {
      parameterAverages: averages,
      overallAverage: overallCount > 0 ? overallAverage / overallCount : 0,
      totalFeedbacks: candidateFeedbacksFiltered.length,
    };
  }, [type, name, email, candidateFeedbacks]);

  const getStatusIcon = (status: string) => {
    const normalized = status?.toLowerCase().trim();
    if (normalized === 'completed') {
      return <CheckCircle className="w-4 h-4 text-[#22C55E]" />;
    } else if (normalized === 'cancelled') {
      return <XCircle className="w-4 h-4 text-red-400" />;
    } else if (normalized.includes('no show')) {
      return <AlertCircle className="w-4 h-4 text-orange-400" />;
    } else if (normalized === 'rescheduled') {
      return <Clock className="w-4 h-4 text-yellow-400" />;
    }
    return <AlertCircle className="w-4 h-4 text-gray-400" />;
  };

  const getStatusColor = (status: string) => {
    const normalized = status?.toLowerCase().trim();
    if (normalized === 'completed') return 'text-[#22C55E]';
    if (normalized === 'cancelled') return 'text-red-400';
    if (normalized.includes('no show')) return 'text-orange-400';
    if (normalized === 'rescheduled') return 'text-yellow-400';
    return 'text-gray-400';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border"
        style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 p-6 border-b flex items-center justify-between" style={{ backgroundColor: '#1A3636', borderColor: '#3A5A5A' }}>
          <div>
            <h2 className="text-2xl font-bold text-white">{name}</h2>
            <p className="text-sm text-gray-300 mt-1">{type === 'mentor' ? 'Mentor' : 'Student'} Details</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-opacity-20 transition-colors"
            style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Contact Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-3">
              <Mail className="w-5 h-5 text-[#22C55E]" />
              <div>
                <p className="text-xs text-gray-400">Email</p>
                <p className="text-sm text-white">{email}</p>
              </div>
            </div>
            {phone && (
              <div className="flex items-center space-x-3">
                <Phone className="w-5 h-5 text-[#22C55E]" />
                <div>
                  <p className="text-xs text-gray-400">Phone</p>
                  <p className="text-sm text-white">{phone}</p>
                </div>
              </div>
            )}
            <div className="flex items-center space-x-3">
              <Calendar className="w-5 h-5 text-[#22C55E]" />
              <div>
                <p className="text-xs text-gray-400">Total Sessions</p>
                <p className="text-sm text-white">{filteredSessions.length}</p>
              </div>
            </div>
          </div>

          {/* Average Ratings by Parameter (for students) or Last Session (for mentors) */}
          {type === 'student' && candidateAverageRatings ? (
            <div className="rounded-lg p-4 border" style={{ backgroundColor: '#1A3636', borderColor: '#3A5A5A' }}>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                <Star className="w-5 h-5 mr-2 text-[#22C55E]" />
                Average Ratings by Parameter
              </h3>
              <div className="space-y-3">
                {candidateAverageRatings.parameterAverages.map((param, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                    <div>
                      <p className="text-sm text-white font-medium">{param.label}</p>
                      <p className="text-xs text-gray-400">{param.count} feedback{param.count !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Star className="w-5 h-5 text-[#86EFAC]" />
                      <span className="text-lg font-semibold text-white">{param.average.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
                {candidateAverageRatings.parameterAverages.length > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-lg border-2" style={{ backgroundColor: '#2A4A4A', borderColor: '#22C55E' }}>
                    <div>
                      <p className="text-sm text-white font-bold">Overall Average</p>
                      <p className="text-xs text-gray-400">{candidateAverageRatings.totalFeedbacks} total feedback{candidateAverageRatings.totalFeedbacks !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Star className="w-6 h-6 text-[#22C55E]" />
                      <span className="text-xl font-bold text-[#22C55E]">{candidateAverageRatings.overallAverage.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : lastSession && type === 'mentor' ? (
            <div className="rounded-lg p-4 border" style={{ backgroundColor: '#1A3636', borderColor: '#3A5A5A' }}>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                <Clock className="w-5 h-5 mr-2 text-[#22C55E]" />
                Last Session
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400">Date & Time</p>
                  <p className="text-sm text-white">
                    {(() => {
                      try {
                        return format(parseISO(lastSession.date), 'MMM dd, yyyy');
                      } catch {
                        return lastSession.date;
                      }
                    })()}{' '}
                    {lastSession.time}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Status</p>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(lastSession.sessionStatus)}
                    <p className={`text-sm ${getStatusColor(lastSession.sessionStatus)}`}>
                      {lastSession.sessionStatus}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Session Title</p>
                  <p className="text-sm text-white">{lastSession.inviteTitle || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Mentee</p>
                  <p className="text-sm text-white">{lastSession.studentName}</p>
                </div>
                {lastSession.comments && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-400">Comments</p>
                    <p className="text-sm text-white">{lastSession.comments}</p>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Recent Feedbacks */}
          {recentFeedbacks.length > 0 && (
            <div className="rounded-lg p-4 border" style={{ backgroundColor: '#1A3636', borderColor: '#3A5A5A' }}>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                <Star className="w-5 h-5 mr-2 text-[#22C55E]" />
                Recent Feedbacks
              </h3>
              <div className="space-y-3">
                {recentFeedbacks.map((session, index) => {
                  // Get feedback value - for students, try candidateFeedbacks if not in session
                  let feedbackValue: number | null = null;
                  let isValidRating = false;
                  
                  if (type === 'mentor') {
                    const feedback = session.studentFeedback;
                    const value = typeof feedback === 'number' ? feedback : parseFloat(String(feedback));
                    if (!isNaN(value) && value > 0) {
                      feedbackValue = value;
                      isValidRating = true;
                    }
                  } else {
                    // For students, check session first, then candidateFeedbacks
                    if (session.mentorFeedback) {
                      const value = typeof session.mentorFeedback === 'number' 
                        ? session.mentorFeedback 
                        : parseFloat(String(session.mentorFeedback));
                      if (!isNaN(value) && value > 0 && value <= 5) {
                        feedbackValue = value;
                        isValidRating = true;
                      }
                    }
                    
                    if (!isValidRating) {
                      const matchedFeedback = getSessionFeedbackFromSheet(session);
                      if (matchedFeedback !== null) {
                        feedbackValue = matchedFeedback;
                        isValidRating = true;
                      }
                    }
                  }

                  // Format feedback value as string to avoid type issues
                  const feedbackDisplay = (isValidRating && feedbackValue !== null) 
                    ? feedbackValue.toFixed(1) 
                    : null;

                  return (
                    <div
                      key={index}
                      className="p-3 rounded-lg border"
                      style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm text-white font-medium">
                            {(() => {
                              try {
                                return format(parseISO(session.date), 'MMM dd, yyyy');
                              } catch {
                                return session.date;
                              }
                            })()}
                          </p>
                          <p className="text-xs text-gray-400">
                            {type === 'mentor' ? session.studentName : session.mentorName}
                          </p>
                        </div>
                        {feedbackDisplay !== null && (
                          <div className="flex items-center space-x-1">
                            <Star className="w-4 h-4 text-[#86EFAC]" />
                            <span className="text-sm font-semibold text-white">{feedbackDisplay}</span>
                          </div>
                        )}
                      </div>
                      {session.comments && (
                        <p className="text-xs text-gray-300 mt-2">{session.comments}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* All Sessions */}
          <div className="rounded-lg p-4 border" style={{ backgroundColor: '#1A3636', borderColor: '#3A5A5A' }}>
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
              <Calendar className="w-5 h-5 mr-2 text-[#22C55E]" />
              All Sessions ({filteredSessions.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b" style={{ borderColor: '#3A5A5A' }}>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Time</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">
                      {type === 'mentor' ? 'Student' : 'Mentor'}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                    {type === 'student' && (
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Session Type</th>
                    )}
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSessions.map((session, index) => {
                    // For students, get full feedback object first (this has all the data)
                    const fullFeedback = type === 'student' ? getFullSessionFeedback(session) : null;
                    
                    // Get feedback value for display - prioritize fullFeedback average
                    let feedbackValue: number | null = null;
                    let isValidRating = false;

                    if (type === 'student') {
                      // First, try to get average from fullFeedback (Candidate Feedback sheet)
                      if (fullFeedback) {
                        // Try multiple column name variations - use "Overall Rating" from column L
                        let averageValue = fullFeedback['Overall Rating'] || 
                                          fullFeedback['overall rating'] || 
                                          fullFeedback['Overall rating'] ||
                                          fullFeedback['overallRating'] ||
                                          fullFeedback['Average'] || 
                                          fullFeedback['average'];
                        
                        // If not found by name, try to find by column position (Column L = index 11)
                        if (!averageValue || averageValue === null || averageValue === undefined || averageValue === '') {
                          const allKeys = Object.keys(fullFeedback);
                          if (allKeys.length > 11) {
                            averageValue = fullFeedback[allKeys[11]]; // Column L (0-indexed: 11)
                          }
                        }
                        
                        if (averageValue !== null && averageValue !== undefined && averageValue !== '') {
                          const avgRating = parseFloat(String(averageValue));
                          if (!isNaN(avgRating) && avgRating > 0 && avgRating <= 5) {
                            feedbackValue = avgRating;
                            isValidRating = true;
                          }
                        }
                      }
                      
                      // If not found in fullFeedback, try session.mentorFeedback
                      if (!isValidRating && session.mentorFeedback) {
                        const value = typeof session.mentorFeedback === 'number' 
                          ? session.mentorFeedback 
                          : parseFloat(String(session.mentorFeedback));
                        if (!isNaN(value) && value > 0) {
                          feedbackValue = value;
                          isValidRating = true;
                        }
                      }
                      
                      // Last resort: try getSessionFeedbackFromSheet
                      if (!isValidRating) {
                        const matchedFeedback = getSessionFeedbackFromSheet(session);
                        if (matchedFeedback !== null) {
                          feedbackValue = matchedFeedback;
                          isValidRating = true;
                        }
                      }
                    } else {
                      // For mentors, use studentFeedback
                      const feedback = session.studentFeedback;
                      const value = typeof feedback === 'number' ? feedback : parseFloat(String(feedback));
                      if (!isNaN(value) && value > 0) {
                        feedbackValue = value;
                        isValidRating = true;
                      }
                    }

                    // Format feedback value as string to avoid type issues
                    const feedbackDisplay = (isValidRating && feedbackValue !== null) 
                      ? feedbackValue.toFixed(1) 
                      : null;

                    const hasDetailedFeedback = fullFeedback !== null;
                    const showDetails = selectedSessionIndex === index && type === 'student';

                    return (
                      <React.Fragment key={index}>
                        <tr
                          className={`border-b transition-colors cursor-pointer`}
                          style={{ borderColor: '#3A5A5A' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#2A4A4A';
                            e.currentTarget.style.cursor = 'pointer';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                          onClick={() => {
                            setSelectedSessionIndex(selectedSessionIndex === index ? null : index);
                          }}
                        >
                          <td className="px-4 py-2 text-sm text-white">
                            {(() => {
                              try {
                                return format(parseISO(session.date), 'MMM dd, yyyy');
                              } catch {
                                return session.date;
                              }
                            })()}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-300">{session.time}</td>
                          <td className="px-4 py-2 text-sm text-white">
                            {type === 'mentor' ? session.studentName : session.mentorName}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center space-x-2">
                              {getStatusIcon(session.sessionStatus)}
                              <span className={`text-sm ${getStatusColor(session.sessionStatus)}`}>
                                {session.sessionStatus}
                              </span>
                            </div>
                          </td>
                          {type === 'student' && (
                            <td className="px-4 py-2">
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
                          )}
                          <td className="px-4 py-2">
                            {feedbackDisplay !== null ? (
                              <div className="flex items-center space-x-1">
                                <Star className="w-4 h-4 text-[#86EFAC]" />
                                <span className="text-sm text-white">{feedbackDisplay}</span>
                                <span className="text-xs text-gray-500 ml-2">(Click for details)</span>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-1">
                                <span className="text-sm text-gray-400">N/A</span>
                                <span className="text-xs text-gray-500 ml-2">(Click for details)</span>
                              </div>
                            )}
                          </td>
                        </tr>
                        {showDetails && (
                          <tr>
                            <td colSpan={type === 'student' ? 6 : 5} className="px-4 py-4" style={{ backgroundColor: '#1A3636' }}>
                              <div className="space-y-4">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-md font-semibold text-white">Session Details</h4>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedSessionIndex(null);
                                    }}
                                    className="text-gray-400 hover:text-white"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                                
                                {/* Session Information */}
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                  <div className="p-3 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                    <p className="text-xs text-gray-400 mb-1">Date</p>
                                    <p className="text-sm text-white">
                                      {(() => {
                                        try {
                                          return format(parseISO(session.date), 'MMM dd, yyyy');
                                        } catch {
                                          return session.date;
                                        }
                                      })()}
                                    </p>
                                  </div>
                                  <div className="p-3 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                    <p className="text-xs text-gray-400 mb-1">Time</p>
                                    <p className="text-sm text-white">{session.time}</p>
                                  </div>
                                  <div className="p-3 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                    <p className="text-xs text-gray-400 mb-1">Mentor</p>
                                    <p className="text-sm text-white">{session.mentorName}</p>
                                  </div>
                                  <div className="p-3 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                    <p className="text-xs text-gray-400 mb-1">Status</p>
                                    <div className="flex items-center space-x-2">
                                      {getStatusIcon(session.sessionStatus)}
                                      <span className={`text-sm ${getStatusColor(session.sessionStatus)}`}>
                                        {session.sessionStatus}
                                      </span>
                                    </div>
                                  </div>
                                  {type === 'student' && session.sessionType && (
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
                                  {session.comments && (
                                    <div className="p-3 rounded-lg md:col-span-2" style={{ backgroundColor: '#2A4A4A' }}>
                                      <p className="text-xs text-gray-400 mb-1">Comments</p>
                                      <p className="text-sm text-white">{session.comments}</p>
                                    </div>
                                  )}
                                </div>

                                {/* Feedback Section (only if feedback exists) */}
                                {fullFeedback && (
                                  <>
                                    <div className="border-t pt-4 mt-4" style={{ borderColor: '#3A5A5A' }}>
                                      <h5 className="text-sm font-semibold text-white mb-3">Feedback Details</h5>
                                      
                                      {/* Overall Rating from Column L */}
                                      {((fullFeedback['Overall Rating'] || fullFeedback['overall rating'] || fullFeedback['Average'] || fullFeedback['average'])) && (
                                        <div className="flex items-center space-x-2 mb-3 p-3 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                          <Star className="w-5 h-5 text-[#22C55E]" />
                                          <span className="text-lg font-bold text-white">
                                            Overall Rating: {parseFloat(String(fullFeedback['Overall Rating'] || fullFeedback['overall rating'] || fullFeedback['Average'] || fullFeedback['average'])).toFixed(2)}
                                          </span>
                                        </div>
                                      )}

                                      {/* Case and Difficulty */}
                                      {((fullFeedback['Case'] || fullFeedback['case']) || (fullFeedback['Difficulty'] || fullFeedback['difficulty'])) && (
                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                          {(fullFeedback['Case'] || fullFeedback['case']) && (
                                            <div className="p-3 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                              <p className="text-xs text-gray-400 mb-1">Case</p>
                                              <p className="text-sm text-white">{fullFeedback['Case'] || fullFeedback['case']}</p>
                                            </div>
                                          )}
                                          {(fullFeedback['Difficulty'] || fullFeedback['difficulty']) && (
                                            <div className="p-3 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                              <p className="text-xs text-gray-400 mb-1">Difficulty</p>
                                              <p className="text-sm text-white">{fullFeedback['Difficulty'] || fullFeedback['difficulty']}</p>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Rating Parameters */}
                                      <div className="space-y-2 mb-3">
                                        <p className="text-sm font-semibold text-white mb-2">Rating Parameters:</p>
                                        {[
                                          { key: 'Rating on scoping questions', label: 'Scoping Questions' },
                                          { key: 'Rating on case setup and structure', label: 'Case Setup & Structure' },
                                          { key: 'Rating on quantitative ability (if not tested, rate 1)', label: 'Quantitative Ability' },
                                          { key: 'Rating on communication and confidence', label: 'Communication & Confidence' },
                                          { key: 'Rating on business acumen and creativity', label: 'Business Acumen & Creativity' },
                                        ].map(({ key, label }) => {
                                          const ratingValue = fullFeedback[key];
                                          if (!ratingValue && ratingValue !== 0) return null;
                                          const rating = parseFloat(String(ratingValue));
                                          if (isNaN(rating)) return null;
                                          
                                          return (
                                            <div key={key} className="flex items-center justify-between p-2 rounded-lg" style={{ backgroundColor: '#2A4A4A' }}>
                                              <span className="text-sm text-gray-300">{label}</span>
                                              <div className="flex items-center space-x-2">
                                                <Star className="w-4 h-4 text-[#86EFAC]" />
                                                <span className="text-sm font-medium text-white">{rating.toFixed(1)}</span>
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
                                            {fullFeedback['Overall strength and areas of improvement'] || 
                                             fullFeedback['Comments'] || 
                                             fullFeedback['comments']}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </>
                                )}
                                
                                {!fullFeedback && type === 'student' && (
                                  <div className="p-3 rounded-lg text-center" style={{ backgroundColor: '#2A4A4A' }}>
                                    <p className="text-sm text-gray-400">No feedback available for this session</p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
