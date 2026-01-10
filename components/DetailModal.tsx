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
}

export const DetailModal: React.FC<DetailModalProps> = ({
  isOpen,
  onClose,
  type,
  name,
  email,
  phone,
  sessions,
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
  const recentFeedbacks = sortedSessions
    .filter(s => {
      const feedback = type === 'mentor' ? s.menteeFeedback : s.mentorFeedback;
      return feedback && feedback !== '' && feedback !== 'N/A';
    })
    .slice(0, 5);

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

          {/* Last Session */}
          {lastSession && (
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
                {type === 'mentor' ? (
                  <div>
                    <p className="text-xs text-gray-400">Mentee</p>
                    <p className="text-sm text-white">{lastSession.menteeName}</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-gray-400">Mentor</p>
                    <p className="text-sm text-white">{lastSession.mentorName}</p>
                  </div>
                )}
                {lastSession.comments && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-400">Comments</p>
                    <p className="text-sm text-white">{lastSession.comments}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recent Feedbacks */}
          {recentFeedbacks.length > 0 && (
            <div className="rounded-lg p-4 border" style={{ backgroundColor: '#1A3636', borderColor: '#3A5A5A' }}>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                <Star className="w-5 h-5 mr-2 text-[#22C55E]" />
                Recent Feedbacks
              </h3>
              <div className="space-y-3">
                {recentFeedbacks.map((session, index) => {
                  const feedback = type === 'mentor' ? session.menteeFeedback : session.mentorFeedback;
                  const feedbackValue = typeof feedback === 'number' ? feedback : parseFloat(String(feedback));
                  const isValidRating = !isNaN(feedbackValue) && feedbackValue > 0;

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
                    const feedback = type === 'mentor' ? session.menteeFeedback : session.mentorFeedback;
                    const feedbackValue = typeof feedback === 'number' ? feedback : parseFloat(String(feedback));
                    const isValidRating = !isNaN(feedbackValue) && feedbackValue > 0;

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
