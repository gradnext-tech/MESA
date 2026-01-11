'use client';

import React from 'react';
import { X, Calendar, Clock, Star, CheckCircle, XCircle, AlertCircle, Mail, Phone } from 'lucide-react';
import { Session } from '@/types';
import { parseISO, format } from 'date-fns';

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'mentor' | 'mentee';
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
  if (!isOpen) return null;

  // Sort sessions by date (most recent first)
  const sortedSessions = [...sessions].sort((a, b) => {
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
  
  // Helper function to match session with candidate feedback from candidateFeedbacks sheet
  const getSessionFeedbackFromSheet = React.useCallback((session: Session): number | null => {
    // Try to match with candidateFeedbacks directly
    if (type === 'mentee' && candidateFeedbacks && candidateFeedbacks.length > 0) {
      // Try to match by date, mentor name, and candidate name/email
      const sessionDate = session.date;
      const mentorName = session.mentorName || '';
      const candidateName = session.menteeName || name;
      const candidateEmail = session.menteeEmail || email;

      // Parse session date to match with feedback date
      let sessionDateParsed: Date | null = null;
      try {
        sessionDateParsed = parseISO(sessionDate);
      } catch {
        try {
          sessionDateParsed = new Date(sessionDate);
        } catch {
          // Date parsing failed
        }
      }

      const matchedFeedback = candidateFeedbacks.find(feedback => {
        const feedbackDate = feedback['Session Date'] || '';
        const feedbackMentorName = (feedback['Mentor Name'] || '').toLowerCase().trim();
        const feedbackCandidateName = (feedback['Candidate Name'] || '').toLowerCase().trim();
        const feedbackCandidateEmail = (feedback['Candidate Email'] || '').toLowerCase().trim();

        // Match by candidate name or email
        const candidateMatch = (
          (candidateName && feedbackCandidateName === candidateName.toLowerCase().trim()) ||
          (candidateEmail && feedbackCandidateEmail === candidateEmail.toLowerCase().trim())
        );

        // Match by mentor name
        const mentorMatch = mentorName && feedbackMentorName === mentorName.toLowerCase().trim();

        // Match by date (try multiple date formats)
        let dateMatch = false;
        if (sessionDateParsed && feedbackDate) {
          try {
            const feedbackDateParsed = parseISO(feedbackDate);
            if (!isNaN(feedbackDateParsed.getTime())) {
              // Compare dates (ignore time)
              dateMatch = 
                sessionDateParsed.getFullYear() === feedbackDateParsed.getFullYear() &&
                sessionDateParsed.getMonth() === feedbackDateParsed.getMonth() &&
                sessionDateParsed.getDate() === feedbackDateParsed.getDate();
            }
          } catch {
            // Try other date formats
            try {
              const feedbackDateParsed = new Date(feedbackDate);
              if (!isNaN(feedbackDateParsed.getTime())) {
                dateMatch = 
                  sessionDateParsed.getFullYear() === feedbackDateParsed.getFullYear() &&
                  sessionDateParsed.getMonth() === feedbackDateParsed.getMonth() &&
                  sessionDateParsed.getDate() === feedbackDateParsed.getDate();
              }
            } catch {
              // Date matching failed
            }
          }
        }

        return candidateMatch && mentorMatch && (dateMatch || !sessionDateParsed);
      });

      if (matchedFeedback) {
        const averageValue = matchedFeedback['Average'] || matchedFeedback['average'];
        if (averageValue !== null && averageValue !== undefined && averageValue !== '') {
          const avgRating = parseFloat(String(averageValue));
          if (!isNaN(avgRating) && avgRating > 0 && avgRating <= 5) {
            return avgRating;
          }
        }
      }
    }

    return null;
  }, [type, name, email, candidateFeedbacks]);

  // Get recent feedbacks - for mentees, also check candidateFeedbacks
  const recentFeedbacks = React.useMemo(() => {
    const feedbacks = sortedSessions
      .map(s => {
        let hasFeedback = false;
        if (type === 'mentor') {
          const feedbackValue = String(s.menteeFeedback || '');
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

  // Calculate average ratings per parameter for mentees from Candidate Feedback sheet
  const candidateAverageRatings = React.useMemo(() => {
    if (type !== 'mentee' || !candidateFeedbacks || candidateFeedbacks.length === 0) {
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
            <p className="text-sm text-gray-300 mt-1">{type === 'mentor' ? 'Mentor' : 'Mentee'} Details</p>
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
                <p className="text-sm text-white">{sessions.length}</p>
              </div>
            </div>
          </div>

          {/* Average Ratings by Parameter (for mentees) or Last Session (for mentors) */}
          {type === 'mentee' && candidateAverageRatings ? (
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
                  <p className="text-sm text-white">{lastSession.menteeName}</p>
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
                  // Get feedback value - for mentees, try candidateFeedbacks if not in session
                  let feedbackValue: number | null = null;
                  let isValidRating = false;
                  
                  if (type === 'mentor') {
                    const feedback = session.menteeFeedback;
                    const value = typeof feedback === 'number' ? feedback : parseFloat(String(feedback));
                    if (!isNaN(value) && value > 0) {
                      feedbackValue = value;
                      isValidRating = true;
                    }
                  } else {
                    // For mentees, check session first, then candidateFeedbacks
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
                            {type === 'mentor' ? session.menteeName : session.mentorName}
                          </p>
                        </div>
                        {isValidRating && (
                          <div className="flex items-center space-x-1">
                            <Star className="w-4 h-4 text-[#86EFAC]" />
                            <span className="text-sm font-semibold text-white">{feedbackValue.toFixed(1)}</span>
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
              All Sessions ({sessions.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b" style={{ borderColor: '#3A5A5A' }}>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Time</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">
                      {type === 'mentor' ? 'Mentee' : 'Mentor'}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase">Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSessions.map((session, index) => {
                    // Get feedback - for mentees, use helper function to match with candidateFeedbacks
                    let feedbackValue: number | null = null;
                    let isValidRating = false;

                    if (type === 'mentee') {
                      // Try to get feedback from session first, then from candidateFeedbacks
                      if (session.mentorFeedback) {
                        const value = typeof session.mentorFeedback === 'number' 
                          ? session.mentorFeedback 
                          : parseFloat(String(session.mentorFeedback));
                        if (!isNaN(value) && value > 0) {
                          feedbackValue = value;
                          isValidRating = true;
                        }
                      }
                      
                      // If not found in session, try matching with candidateFeedbacks directly
                      if (!isValidRating) {
                        const matchedFeedback = getSessionFeedbackFromSheet(session);
                        if (matchedFeedback !== null) {
                          feedbackValue = matchedFeedback;
                          isValidRating = true;
                        }
                      }
                    } else {
                      // For mentors, use menteeFeedback
                      const feedback = session.menteeFeedback;
                      const value = typeof feedback === 'number' ? feedback : parseFloat(String(feedback));
                      if (!isNaN(value) && value > 0) {
                        feedbackValue = value;
                        isValidRating = true;
                      }
                    }

                    return (
                      <tr
                        key={index}
                        className="border-b transition-colors"
                        style={{ borderColor: '#3A5A5A' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2A4A4A'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
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
                          {type === 'mentor' ? session.menteeName : session.mentorName}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center space-x-2">
                            {getStatusIcon(session.sessionStatus)}
                            <span className={`text-sm ${getStatusColor(session.sessionStatus)}`}>
                              {session.sessionStatus}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {isValidRating ? (
                            <div className="flex items-center space-x-1">
                              <Star className="w-4 h-4 text-[#86EFAC]" />
                              <span className="text-sm text-white">{feedbackValue.toFixed(1)}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">N/A</span>
                          )}
                        </td>
                      </tr>
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
