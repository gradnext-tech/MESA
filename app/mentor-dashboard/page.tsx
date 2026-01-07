'use client';

import React, { useMemo, useState } from 'react';
import { useData } from '@/context/DataContext';
import { calculateMentorMetrics } from '@/utils/metricsCalculator';
import { MetricCard } from '@/components/MetricCard';
import {
  Star,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  MessageSquare,
  TrendingUp,
  Search,
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
  PieChart,
  Pie,
  Cell,
} from 'recharts';

export default function MentorDashboard() {
  const { sessions, hasData } = useData();
  const [searchTerm, setSearchTerm] = useState('');

  const mentorMetrics = useMemo(() => {
    if (!hasData) return [];
    return calculateMentorMetrics(sessions);
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
        totalFeedbacks: 0,
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
      totalFeedbacks: mentorMetrics.reduce(
        (sum, m) => sum + m.feedbacksFilled,
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

  const sessionStatusData = useMemo(() => {
    return [
      { name: 'Completed', value: aggregateMetrics.totalSessions, color: '#10b981' },
      { name: 'Cancelled', value: aggregateMetrics.totalCancelled, color: '#ef4444' },
      { name: 'No Show', value: aggregateMetrics.totalNoShow, color: '#f59e0b' },
      { name: 'Rescheduled', value: aggregateMetrics.totalRescheduled, color: '#3b82f6' },
    ];
  }, [aggregateMetrics]);

  if (!hasData) {
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
          <h1 className="text-3xl font-bold text-gray-900">Mentor Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Performance metrics for {aggregateMetrics.totalMentors} mentors
          </p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Average Rating"
          value={aggregateMetrics.avgRating}
          icon={Star}
          iconColor="text-yellow-500"
          subtitle="Across all mentors"
        />
        <MetricCard
          title="Total Sessions"
          value={aggregateMetrics.totalSessions}
          icon={CheckCircle}
          iconColor="text-green-500"
          subtitle="Completed sessions"
        />
        <MetricCard
          title="Cancelled/No-Show"
          value={aggregateMetrics.totalCancelled + aggregateMetrics.totalNoShow}
          icon={XCircle}
          iconColor="text-red-500"
          subtitle="Total disruptions"
        />
        <MetricCard
          title="Feedbacks Filled"
          value={aggregateMetrics.totalFeedbacks}
          icon={MessageSquare}
          iconColor="text-blue-500"
          subtitle="Total feedback responses"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Mentors Bar Chart */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Top 10 Mentors by Sessions
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topMentorsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Bar dataKey="sessions" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Session Status Pie Chart */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Session Status Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={sessionStatusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) =>
                  `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`
                }
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {sessionStatusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Mentor List */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">All Mentors</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search mentors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mentor Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg. Rating
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sessions Done
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cancelled
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  No-Show
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rescheduled
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Feedbacks
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredMentors.map((mentor, index) => (
                <tr
                  key={index}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-900">
                        {mentor.mentorName}
                      </span>
                      <span className="text-xs text-gray-500">
                        {mentor.mentorEmail}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Star className="w-4 h-4 text-yellow-500 mr-1" />
                      <span className="text-sm text-gray-900">
                        {mentor.avgRating.toFixed(2)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      {mentor.sessionsDone}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {mentor.sessionsCancelled}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {mentor.sessionsNoShow}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {mentor.sessionsRescheduled}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {mentor.feedbacksFilled}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

