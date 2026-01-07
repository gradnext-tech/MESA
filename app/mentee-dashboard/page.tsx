'use client';

import React, { useMemo, useState } from 'react';
import { useData } from '@/context/DataContext';
import { calculateMenteeMetrics, getDetailedCandidateAnalytics } from '@/utils/metricsCalculator';
import { MetricCard } from '@/components/MetricCard';
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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';

export default function MenteeDashboard() {
  const { sessions, hasData } = useData();
  const [weekFilter, setWeekFilter] = useState<Date | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');

  const menteeMetrics = useMemo(() => {
    if (!hasData) return null;
    return calculateMenteeMetrics(sessions, weekFilter);
  }, [sessions, hasData, weekFilter]);

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

  const feedbackPercentiles = useMemo(() => {
    if (!menteeMetrics) return [];
    return [
      {
        percentile: 'Top 10%',
        score: menteeMetrics.top10PercentFeedback,
        fullMark: 5,
      },
      {
        percentile: 'Top 25%',
        score: menteeMetrics.top25PercentFeedback,
        fullMark: 5,
      },
      {
        percentile: 'Top 50%',
        score: menteeMetrics.top50PercentFeedback,
        fullMark: 5,
      },
      {
        percentile: 'Overall',
        score: menteeMetrics.avgFeedbackScore,
        fullMark: 5,
      },
    ];
  }, [menteeMetrics]);

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
        <h2 className="text-2xl font-bold text-gray-900 mb-2">No Data Available</h2>
        <p className="text-gray-600 mb-6">Please upload your session data first</p>
        <Link
          href="/"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
          <h1 className="text-3xl font-bold text-gray-900">Mentee Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Comprehensive analytics for mentee engagement and performance
          </p>
        </div>
      </div>

      {/* Primary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Sessions Done"
          value={menteeMetrics.totalSessionsDone}
          icon={Calendar}
          iconColor="text-blue-500"
          subtitle="Completed sessions"
        />
        <MetricCard
          title="Avg Daily Sessions"
          value={menteeMetrics.avgDailySessions}
          icon={TrendingUp}
          iconColor="text-green-500"
          subtitle="Per day average"
        />
        <MetricCard
          title="Candidates Booking"
          value={menteeMetrics.candidatesBooking}
          icon={Users}
          iconColor="text-purple-500"
          subtitle="Unique candidates"
        />
        <MetricCard
          title="First Time Candidates"
          value={menteeMetrics.firstTimeCandidates}
          icon={UserPlus}
          iconColor="text-pink-500"
          subtitle="New this period"
        />
      </div>

      {/* Session Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricCard
          title="Avg Sessions (All)"
          value={menteeMetrics.avgSessionsPerCandidateTotal}
          icon={Activity}
          iconColor="text-indigo-500"
          subtitle="Per candidate (total)"
        />
        <MetricCard
          title="Avg Sessions (Active)"
          value={menteeMetrics.avgSessionsPerCandidateActive}
          icon={Activity}
          iconColor="text-cyan-500"
          subtitle="Candidates with ≥1 session"
        />
        <MetricCard
          title="Avg Feedback Score"
          value={menteeMetrics.avgFeedbackScore}
          icon={Star}
          iconColor="text-yellow-500"
          subtitle="Overall average"
        />
      </div>

      {/* Feedback Percentiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricCard
          title="Top 10% Feedback"
          value={menteeMetrics.top10PercentFeedback}
          icon={Trophy}
          iconColor="text-yellow-500"
          subtitle="Based on session count"
        />
        <MetricCard
          title="Top 25% Feedback"
          value={menteeMetrics.top25PercentFeedback}
          icon={Award}
          iconColor="text-orange-500"
          subtitle="Based on session count"
        />
        <MetricCard
          title="Top 50% Feedback"
          value={menteeMetrics.top50PercentFeedback}
          icon={Award}
          iconColor="text-blue-500"
          subtitle="Based on session count"
        />
      </div>

      {/* Cancellations & No-Shows */}
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Metrics Bar Chart */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Performance Metrics Overview
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="metric" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
              />
              <Bar dataKey="value" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Feedback Percentiles Radar Chart */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Feedback Score Percentiles
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={feedbackPercentiles}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="percentile" stroke="#6b7280" />
              <PolarRadiusAxis angle={90} domain={[0, 5]} stroke="#6b7280" />
              <Radar
                name="Feedback Score"
                dataKey="score"
                stroke="#f59e0b"
                fill="#f59e0b"
                fillOpacity={0.6}
              />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Disruptions Chart */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Cancellations & No-Shows Analysis
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={disruptionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="category" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Bar dataKey="Cancelled" fill="#ef4444" radius={[8, 8, 0, 0]} />
              <Bar dataKey="NoShow" fill="#f97316" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Individual Mentee Analytics Table */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Individual Mentee Analytics</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search mentees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <p className="text-gray-600">
            Detailed analytics for {filteredCandidates.length} mentees
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
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
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCandidates.map((candidate, index) => (
                <tr
                  key={index}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-900">
                        {candidate.name}
                      </span>
                      <span className="text-xs text-gray-500">
                        {candidate.email}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-900">
                        {candidate.completedSessions} completed
                      </span>
                      <span className="text-xs text-gray-500">
                        {candidate.totalSessionsBooked} total booked
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                            <div
                              className="bg-green-500 h-2 rounded-full"
                              style={{
                                width: `${Math.min(candidate.completionRate, 100)}%`,
                              }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {candidate.completionRate.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Star className="w-4 h-4 text-yellow-500 mr-1" />
                      <span className="text-sm text-gray-900">
                        {candidate.avgFeedback > 0 ? candidate.avgFeedback.toFixed(2) : 'N/A'}
                      </span>
                      {candidate.feedbackCount > 0 && (
                        <span className="text-xs text-gray-500 ml-1">
                          ({candidate.feedbackCount})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                      {candidate.uniqueMentors}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      {candidate.sessionsCancelled > 0 && (
                        <span className="text-xs text-red-600">
                          {candidate.sessionsCancelled} cancelled
                        </span>
                      )}
                      {candidate.sessionsNoShow > 0 && (
                        <span className="text-xs text-orange-600">
                          {candidate.sessionsNoShow} no-show
                        </span>
                      )}
                      {candidate.sessionsCancelled === 0 && candidate.sessionsNoShow === 0 && (
                        <span className="text-xs text-green-600 flex items-center">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          None
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-500">
                        {candidate.firstSessionDate}
                      </span>
                      <span className="text-xs text-gray-500">
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
            <p className="text-gray-500">No mentees found matching your search.</p>
          </div>
        )}
      </div>

      {/* Insights Section */}
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
          Key Insights
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="bg-white bg-opacity-60 rounded-lg p-4">
            <p className="font-medium text-gray-900 mb-1">Engagement Rate</p>
            <p className="text-gray-700">
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
          <div className="bg-white bg-opacity-60 rounded-lg p-4">
            <p className="font-medium text-gray-900 mb-1">Completion Rate</p>
            <p className="text-gray-700">
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
          <div className="bg-white bg-opacity-60 rounded-lg p-4">
            <p className="font-medium text-gray-900 mb-1">Disruption Rate</p>
            <p className="text-gray-700">
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
          <div className="bg-white bg-opacity-60 rounded-lg p-4">
            <p className="font-medium text-gray-900 mb-1">Retention Insight</p>
            <p className="text-gray-700">
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
    </div>
  );
}

