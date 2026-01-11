import { Session, MentorMetrics, MenteeMetrics, CandidateSessionStats, Mentee } from '@/types';
import { parseISO, differenceInDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, parse, isWithinInterval, startOfDay } from 'date-fns';

/**
 * Helper function to parse session dates consistently
 * Handles MM/DD/YYYY format and other common formats
 */
export function parseSessionDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  try {
    // Try parsing MM/DD/YYYY format manually first (most common in spreadsheets)
    const parts = dateStr.trim().split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0], 10) - 1; // Month is 0-indexed
      const day = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      
      if (!isNaN(month) && !isNaN(day) && !isNaN(year) && month >= 0 && month <= 11) {
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
    
    // Try date-fns parse with common formats
    try {
      let parsed = parse(dateStr, 'M/d/yyyy', new Date());
      if (!isNaN(parsed.getTime())) return parsed;
      
      parsed = parse(dateStr, 'MM/dd/yyyy', new Date());
      if (!isNaN(parsed.getTime())) return parsed;
    } catch {
      // Continue to try other formats
    }
    
    // Try parseISO for ISO format dates
    try {
      const parsed = parseISO(dateStr);
      if (!isNaN(parsed.getTime())) return parsed;
    } catch {
      // Continue to try Date constructor
    }
    
    // Fallback to Date constructor
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
  } catch {
    // Return null if all parsing fails
  }
  
  return null;
}

export function normalizeSessionStatus(raw?: string) {
  if (!raw) return 'unknown';
  const value = raw.trim().toLowerCase().replace(/\s+/g, ' '); // Normalize whitespace

  // Handle completed/done
  if (value === 'completed' || value === 'done') return 'completed';
  
  // Handle pending
  if (value === 'pending') return 'pending';

  // Handle mentee disruptions first (to avoid matching mentor disruptions)
  // Check for mentee/candidate no show
  if ((value.includes('mentee') || value.includes('candidate')) && 
      (value.includes('no show') || value.includes('no-show') || value.includes('noshow'))) {
    return 'mentee_no_show';
  }
  // Check for mentee cancelled
  if (value.includes('mentee') && value.includes('cancel')) {
    return 'mentee_cancelled';
  }
  // Check for mentee rescheduled
  if (value.includes('mentee') && value.includes('reschedule')) {
    return 'mentee_rescheduled';
  }

  // Handle mentor disruptions - be more flexible with matching
  // Check for mentor no show (must check mentor first to avoid matching mentee)
  if (value.includes('mentor') && (value.includes('no show') || value.includes('no-show') || value.includes('noshow'))) {
    return 'mentor_no_show';
  }
  // Check for mentor cancelled
  if (value.includes('mentor') && value.includes('cancel')) {
    return 'mentor_cancelled';
  }
  // Check for mentor rescheduled
  if (value.includes('mentor') && value.includes('reschedule')) {
    return 'mentor_rescheduled';
  }

  // Handle admin disruptions (not counted as disruptions for either dashboard)
  if (value.includes('admin') && value.includes('cancel')) {
    return 'admin_cancelled';
  }
  if (value.includes('admin') && value.includes('reschedule')) {
    return 'admin_rescheduled';
  }

  // Legacy support for old format (without prefixes) - treat as generic
  // These should be updated in the spreadsheet, but we'll handle them gracefully
  if (value === 'cancelled' && !value.includes('mentor') && !value.includes('mentee') && !value.includes('admin')) {
    return 'unknown_cancelled'; // Don't count in either dashboard
  }
  if (value === 'rescheduled' && !value.includes('mentor') && !value.includes('mentee') && !value.includes('admin')) {
    return 'unknown_rescheduled'; // Don't count in either dashboard
  }

  return 'unknown';
}

/**
 * Calculate Mentor Metrics from session data
 */
export function calculateMentorMetrics(sessions: Session[]): MentorMetrics[] {
  const mentorMap = new Map<string, MentorMetrics>();

  sessions.forEach((session) => {
    // Use normalized email as key (lowercase, trimmed) to ensure proper grouping
    const email = (session.mentorEmail || '').trim().toLowerCase();
    if (!email) {
      return; // Skip sessions without mentor email
    }

    const status = normalizeSessionStatus(session.sessionStatus);
    
    if (!mentorMap.has(email)) {
      mentorMap.set(email, {
        mentorName: session.mentorName || session.mentorEmail || 'Unknown',
        mentorEmail: session.mentorEmail || email,
        avgRating: 0,
        sessionsDone: 0,
        sessionsCancelled: 0,
        sessionsNoShow: 0,
        sessionsRescheduled: 0,
        feedbacksFilled: 0,
      });
    }

    const metrics = mentorMap.get(email)!;

    // Count sessions done (completed sessions)
    if (status === 'completed') {
      metrics.sessionsDone++;
    }

    // Count mentor disruptions only (for mentor metrics)
    if (status === 'mentor_cancelled') {
      metrics.sessionsCancelled++;
    }
    if (status === 'mentor_no_show') {
      metrics.sessionsNoShow++;
    }
    if (status === 'mentor_rescheduled') {
      metrics.sessionsRescheduled++;
    }

    // Count feedbacks NOT filled (for completed sessions only)
    // A feedback is considered "not filled" if the session is completed but has no menteeFeedback
    if (status === 'completed') {
      if (!session.menteeFeedback || session.menteeFeedback === '' || session.menteeFeedback === 'N/A') {
        metrics.feedbacksFilled++; // Using this field to store "not filled" count
      }
    }
  });

  // Calculate average ratings from menteeFeedback (ratings from candidates about mentors)
  mentorMap.forEach((metrics, email) => {
    // Match by normalized email (case-insensitive)
    const mentorSessions = sessions.filter(s => 
      (s.mentorEmail || '').trim().toLowerCase() === email
    );
    
    // Extract numeric ratings from menteeFeedback field
    const ratings = mentorSessions
      .map(s => {
        const feedback = s.menteeFeedback;
        if (!feedback) return null;
        
        // Try to parse as number
        const numericValue = parseFloat(String(feedback).replace(/[^0-9.]/g, ''));
        if (!isNaN(numericValue) && numericValue >= 1 && numericValue <= 5) {
          return numericValue;
        }
        return null;
      })
      .filter((r): r is number => r !== null && !isNaN(r) && r > 0);
    
    if (ratings.length > 0) {
      metrics.avgRating = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10; // Round to 1 decimal
    } else {
      metrics.avgRating = 0;
    }
    
    // Debug logging for all mentors with ratings
    if (ratings.length > 0) {
      console.log(`Mentor ${metrics.mentorName} (${email}) - Total sessions: ${mentorSessions.length}, Sessions with ratings: ${ratings.length}, Ratings: [${ratings.join(', ')}], Avg rating: ${metrics.avgRating}`);
    } else if (mentorSessions.length > 0) {
      // Log mentors without ratings to help debug
      const sessionsWithFeedback = mentorSessions.filter(s => s.menteeFeedback);
      console.log(`Mentor ${metrics.mentorName} (${email}) - Total sessions: ${mentorSessions.length}, Sessions with menteeFeedback field: ${sessionsWithFeedback.length}`);
      if (sessionsWithFeedback.length > 0) {
        console.log(`  Sample menteeFeedback values:`, sessionsWithFeedback.slice(0, 3).map(s => s.menteeFeedback));
      }
    }
  });

  return Array.from(mentorMap.values());
}

/**
 * Calculate Mentee Dashboard Metrics from session data
 */
export function calculateMenteeMetrics(sessions: Session[], weekFilter?: Date, mentees?: Mentee[], candidateFeedbacks?: any[], monthFilter?: string, menteeEmailFilter?: string | string[]): MenteeMetrics {
  let filteredSessions = sessions;

  // Filter by week if provided
  if (weekFilter) {
    const weekStart = startOfWeek(weekFilter, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekFilter, { weekStartsOn: 1 });
    
    filteredSessions = filteredSessions.filter(session => {
      try {
        let sessionDate: Date;
        try {
          sessionDate = parseISO(session.date);
        } catch {
          sessionDate = new Date(session.date);
        }
        return !isNaN(sessionDate.getTime()) && sessionDate >= weekStart && sessionDate <= weekEnd;
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
    
    filteredSessions = filteredSessions.filter(session => {
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
  if (menteeEmailFilter) {
    const filterEmails = Array.isArray(menteeEmailFilter) ? menteeEmailFilter : [menteeEmailFilter];
    if (filterEmails.length > 0) {
      const normalizedFilterEmails = filterEmails.map(e => (e || '').trim().toLowerCase()).filter(e => e);
      filteredSessions = filteredSessions.filter(session => {
        const sessionEmail = (session.menteeEmail || '').trim().toLowerCase();
        return normalizedFilterEmails.includes(sessionEmail);
      });
    }
  }

  // Total Sessions Done
  const completedSessions = filteredSessions.filter(
    (s) => normalizeSessionStatus(s.sessionStatus) === 'completed'
  );
  const totalSessionsDone = completedSessions.length;

  // Average daily sessions
  const dates = [...new Set(completedSessions.map(s => s.date))];
  const avgDailySessions = dates.length > 0 ? totalSessionsDone / dates.length : 0;

  // Unique candidates booking sessions
  const uniqueCandidates = new Set(filteredSessions.map(s => s.menteeEmail));
  const candidatesBooking = uniqueCandidates.size;

  // Calculate candidate session stats
  const candidateStats = calculateCandidateStats(filteredSessions);
  const candidateStatsCompleted = calculateCandidateStats(completedSessions);

  // First time candidates: candidates who didn't book last week but booked this week
  // "This week" = the week being analyzed (weekFilter if provided, otherwise current week)
  const referenceDate = weekFilter || new Date();
  const currentWeekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
  const currentWeekEnd = endOfWeek(referenceDate, { weekStartsOn: 1 });
  
  // Calculate previous week
  const previousWeekStart = startOfWeek(subWeeks(currentWeekStart, 1), { weekStartsOn: 1 });
  const previousWeekEnd = endOfWeek(subWeeks(currentWeekStart, 1), { weekStartsOn: 1 });
  
  // Get candidates who booked this week (from all sessions, not just filtered)
  const candidatesThisWeek = new Set(
    sessions
      .filter(s => {
        if (!s.menteeEmail) return false;
        try {
          let sessionDate: Date;
          try {
            sessionDate = parseISO(s.date);
          } catch {
            sessionDate = new Date(s.date);
          }
          return !isNaN(sessionDate.getTime()) && sessionDate >= currentWeekStart && sessionDate <= currentWeekEnd;
        } catch {
          return false;
        }
      })
      .map(s => s.menteeEmail)
      .filter(email => email && email.trim() !== '') // Filter out empty emails
  );
  
  // Get candidates who booked last week
  const candidatesLastWeek = new Set(
    sessions
      .filter(s => {
        if (!s.menteeEmail) return false;
        try {
          let sessionDate: Date;
          try {
            sessionDate = parseISO(s.date);
          } catch {
            sessionDate = new Date(s.date);
          }
          return !isNaN(sessionDate.getTime()) && sessionDate >= previousWeekStart && sessionDate <= previousWeekEnd;
        } catch {
          return false;
        }
      })
      .map(s => s.menteeEmail)
      .filter(email => email && email.trim() !== '') // Filter out empty emails
  );
  
  // First time candidates = candidates who booked this week but NOT last week
  const firstTimeCandidates = Array.from(candidatesThisWeek).filter(
    email => !candidatesLastWeek.has(email)
  ).length;

  // Average sessions per candidate (total)
  const avgSessionsPerCandidateTotal = candidatesBooking > 0 
    ? totalSessionsDone / candidatesBooking 
    : 0;

  // Average sessions per candidate (who have done at least 1 session)
  const activeCandidates = candidateStatsCompleted.filter(c => c.sessionCount >= 1);
  const avgSessionsPerCandidateActive = activeCandidates.length > 0
    ? activeCandidates.reduce((sum, c) => sum + c.sessionCount, 0) / activeCandidates.length
    : 0;

  // Average feedback score - read directly from column M (Average) in candidate feedbacks
  const feedbackScores: number[] = [];
  
  if (candidateFeedbacks && Array.isArray(candidateFeedbacks) && candidateFeedbacks.length > 0) {
    // Get all keys from first feedback to find the Average column
    const firstFeedback = candidateFeedbacks[0];
    const allKeys = Object.keys(firstFeedback);
    
    // Column M is the 13th column (index 12), but we need to find it by name
    // Try to find column that contains "average" (case insensitive)
    let averageKey: string | null = null;
    for (const key of allKeys) {
      if (key.toLowerCase().includes('average') || key.toLowerCase() === 'avg') {
        averageKey = key;
        break;
      }
    }
    
    // If not found by name, try column M (13th column, index 12)
    if (!averageKey && allKeys.length > 12) {
      averageKey = allKeys[12]; // Column M (0-indexed: 12)
    }
    
    if (!averageKey) {
      console.error('Could not find Average column. Available columns:', allKeys);
    }
    
    candidateFeedbacks.forEach((feedback) => {
      if (averageKey) {
        const averageValue = feedback[averageKey];
        if (averageValue !== null && averageValue !== undefined && averageValue !== '') {
          const avgRating = parseFloat(String(averageValue));
          if (!isNaN(avgRating) && avgRating > 0 && avgRating <= 5) {
            feedbackScores.push(avgRating);
          }
        }
      }
    });
  }
  
  const avgFeedbackScore = feedbackScores.length > 0
    ? feedbackScores.reduce((a, b) => a + b, 0) / feedbackScores.length
    : 0;

  // Calculate average sessions per week
  // Use ALL sessions (not just filtered) to calculate weeks, but use completed sessions for count
  const allCandidateStats = calculateCandidateStats(sessions);
  const weeksWithSessions = new Set<string>();
  
  
  sessions.forEach((s) => {
    try {
      // Parse date - handle MM/DD/YYYY format manually (same approach as page.tsx)
      let sessionDate: Date | null = null;
      const dateStr = s.date;
      
      if (!dateStr) return;
      
      // Try parsing MM/DD/YYYY format manually first
      if (typeof dateStr === 'string') {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          // MM/DD/YYYY format - parse manually
          const month = parseInt(parts[0], 10) - 1; // Month is 0-indexed in Date constructor
          const day = parseInt(parts[1], 10);
          const year = parseInt(parts[2], 10);
          
          if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
            sessionDate = new Date(year, month, day);
          }
        }
      }
      
      // Fallback to parseISO or new Date if manual parsing didn't work
      if (!sessionDate || isNaN(sessionDate.getTime())) {
        try {
          sessionDate = parseISO(dateStr);
        } catch {
          sessionDate = new Date(dateStr);
        }
      }
      
      if (sessionDate && !isNaN(sessionDate.getTime())) {
        const weekStart = startOfWeek(sessionDate, { weekStartsOn: 1 });
        weeksWithSessions.add(weekStart.toISOString());
      }
    } catch (e) {
      // Skip invalid dates
    }
  });
  
  // Calculate average sessions per week (completed sessions per unique week)
  const avgSessionsPerWeek = weeksWithSessions.size > 0 
    ? totalSessionsDone / weeksWithSessions.size 
    : 0;
  
  // Debug logging
  console.log('Avg Sessions Per Week calculation:', {
    totalSessions: sessions.length,
    totalSessionsDone,
    uniqueWeeks: weeksWithSessions.size,
    avgSessionsPerWeek: avgSessionsPerWeek || 0,
    weekKeys: Array.from(weeksWithSessions).slice(0, 5),
    sampleSessionDates: sessions.slice(0, 3).map(s => ({ date: s.date, status: s.sessionStatus }))
  });

  // Calculate average rating per week - using mentorFeedback (ratings from mentors about mentees)
  const weeklyRatings: number[] = [];
  const weekRatingMap = new Map<string, number[]>();
  
  // Debug: Check how many sessions have mentorFeedback
  const sessionsWithFeedback = completedSessions.filter(s => s.mentorFeedback && s.mentorFeedback !== '');
  console.log('Sessions with mentorFeedback:', {
    totalCompleted: completedSessions.length,
    withFeedback: sessionsWithFeedback.length,
    sampleFeedbacks: sessionsWithFeedback.slice(0, 3).map(s => ({
      date: s.date,
      mentorName: s.mentorName,
      menteeName: s.menteeName,
      mentorFeedback: s.mentorFeedback
    })),
    sampleSessionsWithoutFeedback: completedSessions.filter(s => !s.mentorFeedback).slice(0, 3).map(s => ({
      date: s.date,
      mentorName: s.mentorName,
      menteeName: s.menteeName,
      mentorFeedback: s.mentorFeedback || 'EMPTY'
    }))
  });
  
  completedSessions.forEach(s => {
    try {
      // Parse date - handle MM/DD/YYYY format manually (same approach as page.tsx)
      let sessionDate: Date | null = null;
      const dateStr = s.date;
      
      if (!dateStr) return;
      
      // Try parsing MM/DD/YYYY format manually first
      if (typeof dateStr === 'string') {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          // MM/DD/YYYY format - parse manually
          const month = parseInt(parts[0], 10) - 1; // Month is 0-indexed in Date constructor
          const day = parseInt(parts[1], 10);
          const year = parseInt(parts[2], 10);
          
          if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
            sessionDate = new Date(year, month, day);
          }
        }
      }
      
      // Fallback to parseISO or new Date if manual parsing didn't work
      if (!sessionDate || isNaN(sessionDate.getTime())) {
        try {
          sessionDate = parseISO(dateStr);
        } catch {
          sessionDate = new Date(dateStr);
        }
      }
      
      if (sessionDate && !isNaN(sessionDate.getTime())) {
        const weekStart = startOfWeek(sessionDate, { weekStartsOn: 1 });
        const weekKey = weekStart.toISOString();
        const feedback = s.mentorFeedback; // Use mentorFeedback (from candidate feedback sheet)
        if (feedback) {
          const rating = parseFloat(String(feedback).replace(/[^0-9.]/g, ''));
          if (!isNaN(rating) && rating > 0 && rating <= 5) {
            if (!weekRatingMap.has(weekKey)) {
              weekRatingMap.set(weekKey, []);
            }
            weekRatingMap.get(weekKey)!.push(rating);
          }
        }
      }
    } catch (e) {
      // Skip invalid dates
      console.warn('Invalid date for rating calculation:', s.date, e);
    }
  });
  weekRatingMap.forEach((ratings) => {
    const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    weeklyRatings.push(avgRating);
  });
  const avgRatingPerWeek = weeklyRatings.length > 0
    ? weeklyRatings.reduce((a, b) => a + b, 0) / weeklyRatings.length
    : 0;
  
  // Debug logging
  console.log('Avg Rating Per Week calculation:', {
    totalCompletedSessions: completedSessions.length,
    weeksWithRatings: weekRatingMap.size,
    totalWeeklyRatings: weeklyRatings.length,
    avgRatingPerWeek,
    sampleWeekRatings: Array.from(weekRatingMap.entries()).slice(0, 3).map(([week, ratings]) => ({
      week,
      ratings,
      avg: ratings.reduce((a, b) => a + b, 0) / ratings.length
    }))
  });

  // Top 10% candidates by number of sessions booked (return list)
  const sortedBySessions = [...allCandidateStats].sort((a, b) => b.totalSessionsBooked - a.totalSessionsBooked);
  const top10BySessionsCount = Math.ceil(sortedBySessions.length * 0.1);
  const top10BySessions = top10BySessionsCount > 0 ? sortedBySessions.slice(0, top10BySessionsCount) : [];

  // Top 10% candidates by rating - calculate from Candidate Feedback sheet
  let top10ByRating: CandidateSessionStats[] = [];
  if (candidateFeedbacks && Array.isArray(candidateFeedbacks) && candidateFeedbacks.length > 0) {
    // Group feedbacks by candidate email/name and calculate average rating
    const candidateRatingMap = new Map<string, { name: string; email: string; ratings: number[]; count: number }>();
    
    candidateFeedbacks.forEach((feedback) => {
      const candidateName = feedback['Candidate Name'] || feedback['candidateName'] || '';
      const candidateEmail = feedback['Candidate Email'] || feedback['candidateEmail'] || '';
      const averageValue = feedback['Average'] || feedback['average'];
      
      if (candidateName || candidateEmail) {
        const key = (candidateEmail || candidateName).toLowerCase().trim();
        if (!candidateRatingMap.has(key)) {
          candidateRatingMap.set(key, {
            name: candidateName,
            email: candidateEmail,
            ratings: [],
            count: 0
          });
        }
        
        const candidateData = candidateRatingMap.get(key)!;
        if (averageValue !== null && averageValue !== undefined && averageValue !== '') {
          const avgRating = parseFloat(String(averageValue));
          if (!isNaN(avgRating) && avgRating > 0 && avgRating <= 5) {
            candidateData.ratings.push(avgRating);
            candidateData.count++;
          }
        }
      }
    });
    
    // Calculate average for each candidate and create CandidateSessionStats
    const candidatesWithRatings: CandidateSessionStats[] = [];
    candidateRatingMap.forEach((data, key) => {
      if (data.ratings.length > 0) {
        const avgRating = data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length;
        // Find matching candidate stats to get session count
        const matchingStats = allCandidateStats.find(c => 
          (c.email && c.email.toLowerCase().trim() === key) ||
          (c.name && c.name.toLowerCase().trim() === key)
        );
        
        candidatesWithRatings.push({
          name: data.name || matchingStats?.name || 'Unknown',
          email: data.email || matchingStats?.email || '',
          sessionCount: matchingStats?.sessionCount || 0,
          totalSessionsBooked: matchingStats?.totalSessionsBooked || 0,
          avgFeedback: avgRating,
          feedbackCount: data.count,
          sessionsCancelled: matchingStats?.sessionsCancelled || 0,
          sessionsNoShow: matchingStats?.sessionsNoShow || 0,
          completedSessions: matchingStats?.completedSessions || 0,
          firstSessionDate: matchingStats?.firstSessionDate || '',
          lastSessionDate: matchingStats?.lastSessionDate || '',
          uniqueMentors: matchingStats?.uniqueMentors || 0,
          completionRate: matchingStats?.completionRate || 0,
        });
      }
    });
    
    // Sort by average rating and take top 10%
    const sortedByRating = [...candidatesWithRatings].sort((a, b) => b.avgFeedback - a.avgFeedback);
    const top10ByRatingCount = Math.ceil(sortedByRating.length * 0.1);
    top10ByRating = top10ByRatingCount > 0 ? sortedByRating.slice(0, top10ByRatingCount) : [];
  } else {
    // Fallback to old method if no candidateFeedbacks
    const candidatesWithRatings = allCandidateStats.filter(c => c.avgFeedback > 0);
    const sortedByRating = [...candidatesWithRatings].sort((a, b) => b.avgFeedback - a.avgFeedback);
    const top10ByRatingCount = Math.ceil(sortedByRating.length * 0.1);
    top10ByRating = top10ByRatingCount > 0 ? sortedByRating.slice(0, top10ByRatingCount) : [];
  }

  // Bottom 10% and 25% candidates by feedback (return lists)
  const candidatesWithFeedback = allCandidateStats.filter(c => c.feedbackCount > 0);
  const sortedByFeedbackAsc = [...candidatesWithFeedback].sort((a, b) => a.avgFeedback - b.avgFeedback);
  const bottom10Count = Math.ceil(sortedByFeedbackAsc.length * 0.1);
  const bottom25Count = Math.ceil(sortedByFeedbackAsc.length * 0.25);
  const bottom10Feedback = bottom10Count > 0 ? sortedByFeedbackAsc.slice(0, bottom10Count) : [];
  const bottom25Feedback = bottom25Count > 0 ? sortedByFeedbackAsc.slice(0, bottom25Count) : [];

  // Candidates with no sessions booked (from mentee directory)
  const candidatesNoSessions: Mentee[] = [];
  if (mentees && mentees.length > 0) {
    const candidatesWithSessions = new Set(sessions.map(s => (s.menteeEmail || '').trim().toLowerCase()).filter(e => e));
    mentees.forEach(mentee => {
      const menteeEmail = (mentee.email || '').trim().toLowerCase();
      if (menteeEmail && !candidatesWithSessions.has(menteeEmail)) {
        candidatesNoSessions.push(mentee);
      }
    });
  }

  // Cancelled and No-shows (only mentee/candidate no-shows for mentee metrics)
  const cancelledSessions = filteredSessions.filter(
    (s) => normalizeSessionStatus(s.sessionStatus) === 'mentee_cancelled'
  );
  const noShowSessions = filteredSessions.filter((s) => {
    const status = normalizeSessionStatus(s.sessionStatus);
    return status === 'mentee_no_show'; // Only count mentee/candidate no-shows
  });

  const rescheduledSessions = filteredSessions.filter((s) => {
    const rawStatus = (s.sessionStatus || '').toLowerCase().trim();
    // Only count mentee rescheduled (not mentor or admin)
    return rawStatus.includes('mentee') && rawStatus.includes('reschedule');
  });

  const totalSessionsCancelled = cancelledSessions.length;
  const totalNoShows = noShowSessions.length;
  const totalSessionsRescheduled = rescheduledSessions.length;

  const candidatesCancelled = new Set(cancelledSessions.map(s => s.menteeEmail)).size;
  const candidatesNoShow = new Set(noShowSessions.map(s => s.menteeEmail)).size;
  const candidatesRescheduled = new Set(rescheduledSessions.map(s => s.menteeEmail)).size;

  return {
    totalSessionsDone,
    avgDailySessions,
    candidatesBooking,
    firstTimeCandidates,
    avgSessionsPerCandidateTotal,
    avgSessionsPerCandidateActive,
    avgFeedbackScore,
    avgSessionsPerWeek,
    avgRatingPerWeek,
    top10BySessions,
    top10ByRating,
    bottom10Feedback,
    bottom25Feedback,
    candidatesNoSessions,
    totalSessionsCancelled,
    totalSessionsRescheduled,
    totalNoShows,
    candidatesCancelled,
    candidatesRescheduled,
    candidatesNoShow,
  };
}

/**
 * Calculate per-candidate session statistics
 */
function calculateCandidateStats(sessions: Session[]): CandidateSessionStats[] {
  const candidateMap = new Map<string, CandidateSessionStats>();

  sessions.forEach(session => {
    const email = session.menteeEmail;
    
    if (!candidateMap.has(email)) {
      candidateMap.set(email, {
        email,
        name: session.menteeName,
        sessionCount: 0,
        avgFeedback: 0,
        feedbackCount: 0,
        sessionsCancelled: 0,
        sessionsNoShow: 0,
        completedSessions: 0,
        firstSessionDate: session.date,
        lastSessionDate: session.date,
        uniqueMentors: 0,
        totalSessionsBooked: 0,
        completionRate: 0,
      });
    }

    const stats = candidateMap.get(email)!;
    stats.sessionCount++;
    stats.totalSessionsBooked++;

    // Update date range
    if (session.date < stats.firstSessionDate) {
      stats.firstSessionDate = session.date;
    }
    if (session.date > stats.lastSessionDate) {
      stats.lastSessionDate = session.date;
    }

    // Count session types using normalised status
    const status = normalizeSessionStatus(session.sessionStatus);
    if (status === 'completed') {
      stats.completedSessions++;
    } else if (status === 'mentee_cancelled') {
      stats.sessionsCancelled++;
    } else if (status === 'mentee_no_show') {
      // Only count mentee/candidate no-shows for candidate stats
      stats.sessionsNoShow++;
    }

    // Calculate feedback
    const feedback = parseFloat(String(session.menteeFeedback));
    if (!isNaN(feedback) && feedback > 0) {
      stats.avgFeedback = (stats.avgFeedback * stats.feedbackCount + feedback) / (stats.feedbackCount + 1);
      stats.feedbackCount++;
    }
  });

  // Calculate completion rates and unique mentors
  candidateMap.forEach((stats, email) => {
    const candidateSessions = sessions.filter(s => s.menteeEmail === email);
    const uniqueMentorEmails = new Set(candidateSessions.map(s => s.mentorEmail));
    stats.uniqueMentors = uniqueMentorEmails.size;
    
    if (stats.totalSessionsBooked > 0) {
      stats.completionRate = (stats.completedSessions / stats.totalSessionsBooked) * 100;
    }
  });

  return Array.from(candidateMap.values());
}

/**
 * Calculate average feedback from candidate stats
 */
function calculateAvgFeedback(candidates: CandidateSessionStats[]): number {
  if (candidates.length === 0) return 0;
  
  const totalFeedback = candidates.reduce((sum, c) => sum + c.avgFeedback, 0);
  return totalFeedback / candidates.length;
}

/**
 * Get detailed candidate analytics for mentee dashboard table
 */
export function getDetailedCandidateAnalytics(sessions: Session[]): CandidateSessionStats[] {
  const candidateStats = calculateCandidateStats(sessions);
  
  // Sort by total sessions (most active first)
  return candidateStats.sort((a, b) => b.totalSessionsBooked - a.totalSessionsBooked);
}

/**
 * Mentor session statistics interface
 */
export interface MentorSessionStats {
  mentorName: string;
  mentorEmail: string;
  totalScheduled: number;
  completed: number;
  cancelled: number;
  mentorNoShow: number;
  rescheduled: number;
  pending: number;
  menteeNoShow: number;
  avgRating: number;
  feedbacksNotFilled: number;
}

/**
 * Calculate mentor session statistics with optional week, month, and mentor filters
 */
export function calculateMentorSessionStats(
  sessions: Session[],
  weekFilter?: Date,
  monthFilter?: string, // Format: YYYY-MM
  mentorEmailFilter?: string | string[]
): MentorSessionStats[] {
  let filteredSessions = sessions;

  // Filter by week if provided (week filter takes precedence over month filter)
  if (weekFilter) {
    const weekStart = startOfWeek(weekFilter, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekFilter, { weekStartsOn: 1 });
    
    filteredSessions = sessions.filter(session => {
      try {
        let sessionDate: Date;
        try {
          sessionDate = parseISO(session.date);
        } catch {
          sessionDate = new Date(session.date);
        }
        return !isNaN(sessionDate.getTime()) && sessionDate >= weekStart && sessionDate <= weekEnd;
      } catch {
        return false;
      }
    });
  } 
  // Filter by month if provided (only if week filter is not set)
  else if (monthFilter) {
    const [year, month] = monthFilter.split('-');
    const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    
    filteredSessions = sessions.filter(session => {
      try {
        let sessionDate: Date;
        try {
          sessionDate = parseISO(session.date);
        } catch {
          sessionDate = new Date(session.date);
        }
        return !isNaN(sessionDate.getTime()) && sessionDate >= monthStart && sessionDate <= monthEnd;
      } catch {
        return false;
      }
    });
  }

  // Store original sessions before mentor filtering (needed for mentor info lookup)
  const originalSessions = sessions;

  // Filter by mentor if provided (handle both string and string[])
  if (mentorEmailFilter) {
    const filterEmails = Array.isArray(mentorEmailFilter) 
      ? mentorEmailFilter.map(e => e.trim().toLowerCase())
      : [mentorEmailFilter.trim().toLowerCase()];
    
    const beforeFilterCount = filteredSessions.length;
    filteredSessions = filteredSessions.filter(s => {
      const sessionEmail = (s.mentorEmail || '').trim().toLowerCase();
      return filterEmails.includes(sessionEmail);
    });
    console.log(`Mentor filter applied: ${Array.isArray(mentorEmailFilter) ? mentorEmailFilter.join(', ') : mentorEmailFilter}, Sessions before: ${beforeFilterCount}, Sessions after: ${filteredSessions.length}`);
  }

  // Group by mentor - use email as key, but ensure we have valid email
  const mentorMap = new Map<string, MentorSessionStats>();

  // If mentor filter is applied, pre-populate the map with that mentor's info
  // This ensures we have an entry even if no sessions match after date filtering
  if (mentorEmailFilter) {
    const filterEmails = Array.isArray(mentorEmailFilter) 
      ? mentorEmailFilter.map(e => e.trim().toLowerCase())
      : [mentorEmailFilter.trim().toLowerCase()];
    
    filterEmails.forEach(normalizedFilterEmail => {
      // Try to find the mentor's info from all sessions (not just filtered)
      const mentorSession = originalSessions.find(s => 
        (s.mentorEmail || '').trim().toLowerCase() === normalizedFilterEmail
      );
      
      if (mentorSession) {
        // Use normalized email as key for consistent matching
        const emailKey = (mentorSession.mentorEmail || '').trim().toLowerCase();
        // But preserve original email format in the result
        const originalEmail = mentorSession.mentorEmail || normalizedFilterEmail;
        // Pre-create entry with zeros - will be updated if sessions are found
        mentorMap.set(emailKey, {
          mentorName: mentorSession.mentorName || originalEmail || 'Unknown',
          mentorEmail: originalEmail, // Use original email format
          totalScheduled: 0,
          completed: 0,
          cancelled: 0,
          mentorNoShow: 0,
          rescheduled: 0,
          pending: 0,
          menteeNoShow: 0,
          avgRating: 0,
          feedbacksNotFilled: 0,
        });
        console.log(`Pre-created entry for mentor: ${mentorSession.mentorName} (${originalEmail}), key: ${emailKey}`);
      } else {
        console.warn(`Mentor not found in sessions: ${normalizedFilterEmail}`);
        console.log('Available mentor emails:', [...new Set(originalSessions.map(s => s.mentorEmail).filter(Boolean))].slice(0, 5));
      }
    });
  }

  filteredSessions.forEach((session) => {
    // Use mentor email as key, but skip if email is empty
    const email = (session.mentorEmail || '').trim().toLowerCase();
    if (!email) {
      return; // Skip sessions without mentor email
    }

    const status = normalizeSessionStatus(session.sessionStatus);

    if (!mentorMap.has(email)) {
      mentorMap.set(email, {
        mentorName: session.mentorName || session.mentorEmail || 'Unknown',
        mentorEmail: session.mentorEmail || email,
        totalScheduled: 0,
        completed: 0,
        cancelled: 0,
        mentorNoShow: 0,
        rescheduled: 0,
        pending: 0,
        menteeNoShow: 0,
        avgRating: 0,
        feedbacksNotFilled: 0,
      });
    }

    const stats = mentorMap.get(email)!;
    stats.totalScheduled++;

    switch (status) {
      case 'completed':
        stats.completed++;
        break;
      case 'mentor_cancelled':
      case 'mentee_cancelled':
      case 'admin_cancelled':
      case 'unknown_cancelled':
        stats.cancelled++;
        break;
      case 'mentor_no_show':
        stats.mentorNoShow++;
        break;
      case 'mentor_rescheduled':
      case 'mentee_rescheduled':
      case 'admin_rescheduled':
      case 'unknown_rescheduled':
        stats.rescheduled++;
        break;
      case 'pending':
        stats.pending++;
        break;
      case 'mentee_no_show':
        stats.menteeNoShow++;
        break;
    }
  });

  // Calculate average rating and feedbacks not filled for each mentor
  mentorMap.forEach((stats, email) => {
    // Get all sessions for this mentor (from filtered sessions)
    const mentorSessions = filteredSessions.filter(s => 
      (s.mentorEmail || '').trim().toLowerCase() === email
    );
    
    // Calculate average rating from menteeFeedback
    const ratings = mentorSessions
      .map(s => {
        const feedback = s.menteeFeedback;
        if (!feedback) return null;
        const numericValue = parseFloat(String(feedback).replace(/[^0-9.]/g, ''));
        if (!isNaN(numericValue) && numericValue >= 1 && numericValue <= 5) {
          return numericValue;
        }
        return null;
      })
      .filter((r): r is number => r !== null && !isNaN(r) && r > 0);
    
    if (ratings.length > 0) {
      stats.avgRating = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
    } else {
      stats.avgRating = 0;
    }
    
    // Count feedbacks not filled (completed sessions without feedback)
    const completedSessions = mentorSessions.filter(s => 
      normalizeSessionStatus(s.sessionStatus) === 'completed'
    );
    stats.feedbacksNotFilled = completedSessions.filter(s => 
      !s.menteeFeedback || s.menteeFeedback === '' || s.menteeFeedback === 'N/A'
    ).length;
    
    // Debug logging
    if (ratings.length > 0) {
      console.log(`MentorSessionStats - ${stats.mentorName}: ${ratings.length} ratings, avg: ${stats.avgRating}`);
    } else if (mentorSessions.length > 0) {
      const sessionsWithFeedback = mentorSessions.filter(s => s.menteeFeedback);
      console.log(`MentorSessionStats - ${stats.mentorName}: ${mentorSessions.length} sessions, ${sessionsWithFeedback.length} with feedback`);
      if (sessionsWithFeedback.length > 0) {
        console.log(`  Sample feedback values:`, sessionsWithFeedback.slice(0, 3).map(s => s.menteeFeedback));
      }
    }
  });

  const result = Array.from(mentorMap.values()).sort((a, b) => 
    a.mentorName.localeCompare(b.mentorName)
  );
  
  console.log(`calculateMentorSessionStats result: ${result.length} mentors`, {
    mentorFilter: mentorEmailFilter,
    weekFilter: weekFilter ? weekFilter.toISOString() : undefined,
    monthFilter,
    resultMentors: result.map(r => ({ 
      name: r.mentorName, 
      email: r.mentorEmail, 
      scheduled: r.totalScheduled,
      avgRating: r.avgRating,
      feedbacksNotFilled: r.feedbacksNotFilled
    }))
  });
  
  return result;
}

/**
 * Parse Mesa tracker session data to typed objects
 */
function parseSessionData(sessionData: any[]): Session[] {
  if (!Array.isArray(sessionData)) return [];

  // Debug: Log first row to see column names
  if (sessionData.length > 0) {
    console.log('parseSessionData - First row keys:', Object.keys(sessionData[0]));
    console.log('parseSessionData - First row sample:', sessionData[0]);
  }

  const parsed = sessionData
    .filter((row) => {
      // Only include rows that have actual data - at minimum need date and at least one email
      const hasDate = row['Date'] || row['date'];
      const hasMentorEmail = row['Mentor Email ID'] || row['mentorEmail'] || row['Mentor Email'] || row['mentorEmail'];
      const hasMenteeEmail = row['Mentee Email'] || row['menteeEmail'] || row['Candidate Email'] || row['candidateEmail'];
      return hasDate && (hasMentorEmail || hasMenteeEmail);
    })
    .map((row) => ({
      sNo: row['S No'] || row['sNo'] || null, // Use actual value from sheet, null if missing
    mentorName: row['Mentor Name'] || row['mentorName'] || '',
      mentorEmail: row['Mentor Email ID'] || row['mentorEmail'] || row['Mentor Email'] || '',
      menteeName: row['Mentee Name'] || row['menteeName'] || row['Candidate Name'] || row['candidateName'] || '',
      menteeEmail: row['Mentee Email'] || row['menteeEmail'] || row['Candidate Email'] || row['candidateEmail'] || '',
      menteePhone: row['Mentee Ph no'] || row['menteePhone'] || row['Mentee Phone'] || row['menteePhone'] || '',
    date: row['Date'] || row['date'] || '',
    time: row['Time'] || row['time'] || '',
    inviteTitle: row['Invite Title'] || row['inviteTitle'] || '',
    invitationStatus: row['Invitation status'] || row['invitationStatus'] || '',
    mentorConfirmationStatus: row['Mentor Confirmation Status'] || row['mentorConfirmationStatus'] || '',
    menteeConfirmationStatus: row['Mentee Confirmation Status'] || row['menteeConfirmationStatus'] || '',
    sessionStatus: row['Session Status'] || row['sessionStatus'] || '',
      mentorFeedback: '', // Will be merged from feedbacks sheet
      menteeFeedback: '', // Will be merged from feedbacks sheet
    comments: row['Comments'] || row['comments'] || '',
    paymentStatus: row['Payment Status'] || row['paymentStatus'] || '',
  }));

  console.log('parseSessionData - Parsed sessions count:', parsed.length);
  if (parsed.length > 0) {
    console.log('parseSessionData - First parsed session:', parsed[0]);
    console.log('parseSessionData - Sessions with mentorEmail:', parsed.filter(s => s.mentorEmail).length);
  }

  return parsed;
}

/**
 * Create a unique key for matching sessions with feedbacks
 * Uses: date + mentorEmail + menteeEmail as the matching key
 */
function createSessionKey(session: { date: string; mentorEmail: string; menteeEmail: string }): string {
  return `${session.date}|${session.mentorEmail}|${session.menteeEmail}`.toLowerCase().trim();
}

/**
 * Merge feedback data with session data from two separate feedback sheets
 * - mentorFeedbacks: Feedback from mentees about mentors (goes into menteeFeedback field)
 * - candidateFeedbacks: Feedback from mentors about mentees (goes into mentorFeedback field)
 * Matches feedbacks to sessions based on date, mentor email, and mentee email
 * Only uses actual data from sheets, no placeholder values
 */
function mergeFeedbacksWithSessions(
  sessions: Session[],
  mentorFeedbacks: any[],
  candidateFeedbacks: any[]
): Session[] {
  // Create maps of feedbacks by session key
  const mentorFeedbackMap = new Map<string, any>();
  const candidateFeedbackMap = new Map<string, any>();

  // Process "Mentor Feedback filled by candidates" (mentee feedback about mentor)
  // Column structure:
  // - Timestamp, Your Name (Optional), Mentor Name, Session Date
  // - "Did the mentor join the session on time?"
  // - How would you rate the facilitation style of the mentor?
  // - How would you rate the quality of the feedback provided?
  // - On a scale of 1 to 5 (5 being the best), how would you rate the overall experience of the session?
  // - How could it have been made better and any suggestions for the gradnext team or mentor
  if (Array.isArray(mentorFeedbacks) && mentorFeedbacks.length > 0) {
    console.log('✅ Processing mentor feedbacks (from candidates about mentors), count:', mentorFeedbacks.length);
    if (mentorFeedbacks.length > 0) {
      const firstRow = mentorFeedbacks[0];
      const keys = Object.keys(firstRow);
      console.log('=== MENTOR FEEDBACK DEBUG ===');
      console.log('First mentor feedback row keys:', keys);
      console.log('First mentor feedback row - FULL DATA:', JSON.stringify(firstRow, null, 2));
      
      // Try to find column H (8th column, index 7)
      if (keys.length >= 8) {
        console.log('Column H (index 7) key:', keys[7], 'value:', firstRow[keys[7]]);
      }
      
      // Try to find the rating column by searching for "scale" or "1 to 5"
      const ratingKey = keys.find(k => 
        k.toLowerCase().includes('scale') || 
        k.toLowerCase().includes('1 to 5') ||
        k.toLowerCase().includes('overall experience')
      );
      if (ratingKey) {
        console.log('Found rating column:', ratingKey, 'value:', firstRow[ratingKey]);
      }
    }
    
    mentorFeedbacks.forEach((feedback, index) => {
      // Use actual column names from the sheet
      const date = feedback['Session Date'] || feedback['sessionDate'] || feedback['Date'] || feedback['date'] || '';
      const mentorName = feedback['Mentor Name'] || feedback['mentorName'] || '';
      const menteeName = feedback['Your Name (Optional)'] || feedback['Your Name'] || feedback['yourName'] || '';
      
      // Try to match by date and mentor name (since email might not be in feedback sheet)
      // We'll create a key with date and mentor name, and try to match with sessions
      if (date && mentorName) {
        // Normalize date format (remove time if present)
        // Handle various date formats: "2024-01-15", "1/15/2024", "15-01-2024", etc.
        let normalizedDate = date.split(' ')[0].split('T')[0];
        
        // Try to parse and reformat date if needed
        try {
          const dateObj = new Date(normalizedDate);
          if (!isNaN(dateObj.getTime())) {
            // Format as YYYY-MM-DD
            normalizedDate = dateObj.toISOString().split('T')[0];
          }
        } catch (e) {
          // Keep original format if parsing fails
        }
        
        const key = `${normalizedDate}|${mentorName}`.toLowerCase().trim();
        mentorFeedbackMap.set(key, feedback);
        
        // Also create alternative keys for matching flexibility
        // Try with just the date part (YYYY-MM-DD)
        const dateOnly = normalizedDate.split('-')[0] + '-' + normalizedDate.split('-')[1] + '-' + normalizedDate.split('-')[2];
        if (dateOnly !== normalizedDate) {
          mentorFeedbackMap.set(`${dateOnly}|${mentorName}`.toLowerCase().trim(), feedback);
        }
        
        if (index === 0) {
          console.log('Sample mentor feedback match key:', key, 'original date:', date, 'normalized:', normalizedDate, 'mentorName:', mentorName);
          
          // Show rating value from column H
          const keys = Object.keys(feedback);
          if (keys.length >= 8) {
            console.log('Column H value:', feedback[keys[7]], 'key:', keys[7]);
          }
        }
      } else {
        if (index === 0) {
          console.warn('Missing required fields for feedback matching:', { date, mentorName, menteeName });
        }
      }
    });
    
    console.log('Mentor feedback map size:', mentorFeedbackMap.size);
    if (mentorFeedbackMap.size > 0) {
      console.log('Sample mentor feedback map keys:', Array.from(mentorFeedbackMap.keys()).slice(0, 5));
    }
  } else {
    console.warn('⚠️ No mentor feedbacks received or array is empty. Check sheet name: "Mentor Feedbacks filled by candidate"');
  }

  // Process "Candidate feedback filled by Mentors" (mentor feedback about mentee)
  // This sheet contains feedback from mentors about mentees
  // Column structure: Timestamp, Mentor Name, Candidate Name, Session Date, Case, Difficulty, Rating on scoping questions, Rating on case setup and structure, Rating on quantitative ability (if not tested, rate 1), Rating on communication and confidence, Rating on business acumen and creativity, Overall strength and areas of improvement
  if (Array.isArray(candidateFeedbacks) && candidateFeedbacks.length > 0) {
    console.log('Processing candidate feedbacks (from mentors), count:', candidateFeedbacks.length);
    if (candidateFeedbacks.length > 0) {
      const firstRow = candidateFeedbacks[0];
      const keys = Object.keys(firstRow);
      console.log('=== CANDIDATE FEEDBACK DEBUG ===');
      console.log('First candidate feedback row keys (all 12 columns):', keys);
      console.log('First candidate feedback row - FULL DATA:', JSON.stringify(firstRow, null, 2));
      console.log('Column name check:', {
        'Session Date': firstRow['Session Date'] || 'NOT FOUND',
        'Mentor Name': firstRow['Mentor Name'] || 'NOT FOUND',
        'Candidate Name': firstRow['Candidate Name'] || 'NOT FOUND',
        'Date': firstRow['Date'] || 'NOT FOUND',
        'Mentor': firstRow['Mentor'] || 'NOT FOUND',
        'Candidate': firstRow['Candidate'] || 'NOT FOUND'
      });
      console.log('All key-value pairs:', Object.entries(firstRow).map(([k, v]) => `"${k}": "${v}"`));
    }
    
    candidateFeedbacks.forEach((feedback, index) => {
      // Log all keys and values for first row to debug
      if (index === 0) {
        const allFields = Object.entries(feedback).map(([k, v]) => ({ key: k, value: v }));
        console.log('First candidate feedback row - all fields:', allFields);
        console.log('All column names:', Object.keys(feedback));
      }
      
      // Extract date - try multiple variations
      let date = feedback['Session Date'] || feedback['sessionDate'] || feedback['SessionDate'] || 
                 feedback['Date'] || feedback['date'] || '';
      
      // Extract mentor name - try multiple variations
      let mentorName = feedback['Mentor Name'] || feedback['mentorName'] || feedback['MentorName'] || 
                      feedback['Mentor'] || feedback['mentor'] || '';
      
      // Extract candidate name - try multiple variations
      let candidateName = feedback['Candidate Name'] || feedback['candidateName'] || feedback['CandidateName'] || 
                         feedback['Candidate'] || feedback['candidate'] || '';
      
      // If still not found, try to find by scanning all keys
      if (!date || !mentorName || !candidateName) {
        const allKeys = Object.keys(feedback);
        for (const key of allKeys) {
          const lowerKey = key.toLowerCase();
          if (!date && (lowerKey.includes('date') || lowerKey.includes('session'))) {
            date = feedback[key] || '';
          }
          if (!mentorName && lowerKey.includes('mentor') && !lowerKey.includes('email')) {
            mentorName = feedback[key] || '';
          }
          if (!candidateName && (lowerKey.includes('candidate') || lowerKey.includes('mentee')) && !lowerKey.includes('email')) {
            candidateName = feedback[key] || '';
          }
        }
      }
      
      if (index === 0) {
        console.log('Extracted values from first candidate feedback:', {
          date: date || 'NOT FOUND',
          mentorName: mentorName || 'NOT FOUND',
          candidateName: candidateName || 'NOT FOUND',
          allKeys: Object.keys(feedback),
          allKeyValuePairs: Object.entries(feedback).map(([k, v]) => ({ key: k, value: String(v).substring(0, 100) }))
        });
      }
      
      if (date && mentorName && candidateName) {
        // Normalize date format (remove time if present, handle various formats)
        let normalizedDate = date.toString().split(' ')[0].split('T')[0];
        
        // Try to parse and reformat date to YYYY-MM-DD
        try {
          const dateObj = new Date(normalizedDate);
          if (!isNaN(dateObj.getTime())) {
            normalizedDate = dateObj.toISOString().split('T')[0];
          }
        } catch (e) {
          // Keep original format if parsing fails
        }
        
        // Create matching keys using date, mentor name, and candidate name
        // Key format: date|mentorName|candidateName
        const key1 = `${normalizedDate}|${mentorName.toString().trim().toLowerCase()}|${candidateName.toString().trim().toLowerCase()}`;
        candidateFeedbackMap.set(key1, feedback);
        
        // Also try with original date format
        const originalDate = date.toString().split(' ')[0].split('T')[0];
        if (originalDate !== normalizedDate) {
          const key2 = `${originalDate}|${mentorName.toString().trim().toLowerCase()}|${candidateName.toString().trim().toLowerCase()}`;
          candidateFeedbackMap.set(key2, feedback);
        }
        
        if (index === 0) {
          const key2Value = originalDate !== normalizedDate ? `${originalDate}|${mentorName.toString().trim().toLowerCase()}|${candidateName.toString().trim().toLowerCase()}` : 'same as key1';
          console.log('Created candidate feedback keys:', { key1, key2: key2Value });
        }
      } else {
        if (index === 0) {
          // Log EVERYTHING to debug
          console.error('=== MISSING REQUIRED FIELDS DEBUG ===');
          console.error('Date found:', date || 'MISSING');
          console.error('Mentor Name found:', mentorName || 'MISSING');
          console.error('Candidate Name found:', candidateName || 'MISSING');
          console.error('All available keys:', Object.keys(feedback));
          console.error('All key-value pairs:', Object.entries(feedback).map(([k, v]) => `"${k}": "${v}"`));
          console.error('Direct column access test:', {
            'Session Date': feedback['Session Date'],
            'sessionDate': feedback['sessionDate'],
            'SessionDate': feedback['SessionDate'],
            'Mentor Name': feedback['Mentor Name'],
            'mentorName': feedback['mentorName'],
            'Candidate Name': feedback['Candidate Name'],
            'candidateName': feedback['candidateName']
          });
        }
      }
    });
    
    console.log('Candidate feedback map size:', candidateFeedbackMap.size);
    if (candidateFeedbackMap.size > 0) {
      console.log('Sample candidate feedback map keys:', Array.from(candidateFeedbackMap.keys()).slice(0, 5));
      console.log('Sample candidate feedback data:', Array.from(candidateFeedbackMap.entries()).slice(0, 2).map(([key, value]) => ({
        key,
        mentorName: value['Mentor Name'],
        candidateName: value['Candidate Name'],
        sessionDate: value['Session Date'],
        ratings: {
          'scoping': value['Rating on scoping questions'],
          'structure': value['Rating on case setup and structure '],
          'quantitative': value['Rating on quantitative ability (if not tested, rate 1)']
        }
      })));
    }
  }

  // Merge feedbacks into sessions - only use actual values from sheets
  const mergedSessions = sessions.map((session) => {
    // Normalize session date for consistent matching
    let sessionDateNormalized = session.date.split(' ')[0].split('T')[0];
    try {
      const dateObj = new Date(sessionDateNormalized);
      if (!isNaN(dateObj.getTime())) {
        sessionDateNormalized = dateObj.toISOString().split('T')[0];
      }
    } catch (e) {
      // Keep original format if parsing fails
    }
    
    // Try to match candidate feedbacks (mentor feedback about mentee)
    // Match using: date|mentorName|candidateName (since feedback sheet uses names, not emails)
    let mentorFeedback = null;
    
    // Strategy 1: Try with normalized date, mentor name, and mentee name
    if (session.mentorName && session.menteeName) {
      const nameKey = `${sessionDateNormalized}|${session.mentorName.trim().toLowerCase()}|${session.menteeName.trim().toLowerCase()}`;
      mentorFeedback = candidateFeedbackMap.get(nameKey);
    }
    
    // Strategy 2: Try with original date format
    if (!mentorFeedback && session.mentorName && session.menteeName) {
      const originalDate = session.date.split(' ')[0].split('T')[0];
      const originalNameKey = `${originalDate}|${session.mentorName.trim().toLowerCase()}|${session.menteeName.trim().toLowerCase()}`;
      mentorFeedback = candidateFeedbackMap.get(originalNameKey);
    }
    
    // Strategy 3: Try alternative date formats
    if (!mentorFeedback && session.mentorName && session.menteeName) {
      const altDate = sessionDateNormalized.replace(/-/g, '/');
      const altKey = `${altDate}|${session.mentorName.trim().toLowerCase()}|${session.menteeName.trim().toLowerCase()}`;
      mentorFeedback = candidateFeedbackMap.get(altKey);
    }
    
    // Strategy 4: Fallback to email-based matching if names don't work
    if (!mentorFeedback && session.mentorEmail && session.menteeEmail) {
      const emailKey = `${sessionDateNormalized}|${session.mentorEmail.trim().toLowerCase()}|${session.menteeEmail.trim().toLowerCase()}`;
      mentorFeedback = candidateFeedbackMap.get(emailKey);
    }
    
    // Try to match mentee feedbacks (mentee feedback about mentor) - multiple strategies
    let menteeFeedback = null;
    
    // Strategy 1: Try with normalized date and mentor name (primary matching for mentor feedbacks)
    if (session.mentorName) {
      const nameKey = `${sessionDateNormalized}|${session.mentorName}`.toLowerCase().trim();
      menteeFeedback = mentorFeedbackMap.get(nameKey);
    }
    
    // Strategy 2: Try with normalized date and mentor name (primary matching for mentor feedbacks)
    if (!menteeFeedback && session.mentorName) {
      const nameKey = `${sessionDateNormalized}|${session.mentorName}`.toLowerCase().trim();
      menteeFeedback = mentorFeedbackMap.get(nameKey);
    }
    
    // Strategy 3: Try with original date format and mentor name
    if (!menteeFeedback && session.mentorName) {
      const originalDate = session.date.split(' ')[0].split('T')[0];
      const originalNameKey = `${originalDate}|${session.mentorName}`.toLowerCase().trim();
      menteeFeedback = mentorFeedbackMap.get(originalNameKey);
    }
    
    // Strategy 4: Try alternative date formats with mentor name
    if (!menteeFeedback && session.mentorName) {
      const altDate = sessionDateNormalized.replace(/-/g, '/');
      const altKey = `${altDate}|${session.mentorName}`.toLowerCase().trim();
      menteeFeedback = mentorFeedbackMap.get(altKey);
    }
    
    // Strategy 5: Try with mentor email if available
    if (!menteeFeedback && session.mentorEmail) {
      const emailKey = `${sessionDateNormalized}|${session.mentorEmail}`.toLowerCase().trim();
      menteeFeedback = mentorFeedbackMap.get(emailKey);
    }
    
    // Strategy 6: Try with normalized date and mentor email
    if (!menteeFeedback && session.mentorEmail && session.menteeEmail) {
      const normalizedKey = `${sessionDateNormalized}|${session.mentorEmail}|${session.menteeEmail}`.toLowerCase().trim();
      menteeFeedback = mentorFeedbackMap.get(normalizedKey);
    }

    let updatedSession = { ...session };

    if (mentorFeedback) {
      // Mentor feedback about mentee - populate mentorFeedback field
      // Calculate average of 5 rating columns:
      // 1. Rating on scoping questions
      // 2. Rating on case setup and structure
      // 3. Rating on quantitative ability (if not tested, rate 1)
      // 4. Rating on communication and confidence
      // 5. Rating on business acumen and creativity
      
      const ratingColumns = [
        'Rating on scoping questions',
        'Rating on case setup and structure',
        'Rating on quantitative ability (if not tested, rate 1)',
        'Rating on communication and confidence',
        'Rating on business acumen and creativity'
      ];
      
      const ratings: number[] = [];
      
      ratingColumns.forEach((columnName) => {
        const value = mentorFeedback[columnName];
        if (value !== null && value !== undefined && value !== '') {
          const numValue = parseFloat(String(value).replace(/[^0-9.]/g, ''));
          if (!isNaN(numValue) && numValue >= 1 && numValue <= 5) {
            ratings.push(numValue);
          }
        }
      });
      
      // Calculate average of all valid ratings
      if (ratings.length > 0) {
        const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
        updatedSession.mentorFeedback = avgRating.toFixed(2);
        
        // Debug logging for first few matches
        if (Math.random() < 0.05) { // Log ~5% of matches to avoid spam
          console.log('Matched candidate feedback to session:', {
            sessionDate: session.date,
            normalizedDate: sessionDateNormalized,
            mentorName: session.mentorName,
            menteeName: session.menteeName,
            ratings,
            avgRating: updatedSession.mentorFeedback
          });
        }
      } else {
        // Log when we have feedback but no valid ratings found
        if (Math.random() < 0.05) {
          console.warn('Candidate feedback found but no valid ratings:', {
            sessionDate: session.date,
            mentorName: session.mentorName,
            availableKeys: Object.keys(mentorFeedback).slice(0, 10),
            ratingValues: ratingColumns.map(col => ({ column: col, value: mentorFeedback[col] }))
          });
        }
      }
      
      // Also merge comments if available (Overall strength and areas of improvement)
      const commentsValue = mentorFeedback['Overall strength and areas of improvement'] || 
                           mentorFeedback['Comments'] || mentorFeedback['comments'] || '';
      if (commentsValue && commentsValue.toString().trim()) {
        updatedSession.comments = commentsValue.toString().trim();
      }
    }

    if (menteeFeedback) {
      // Mentee feedback about mentor - populate menteeFeedback field
      // Column H contains: "On a scale of 1 to 5 (5 being the best), how would you rate the overall experience of the session?"
      // Try multiple variations of the column name
      const feedbackKeys = Object.keys(menteeFeedback);
      
      // First, try to get by column position (H = 8th column, index 7)
      let ratingValue = feedbackKeys.length >= 8 ? menteeFeedback[feedbackKeys[7]] : null;
      
      // If not found by position, try by column name
      if (!ratingValue || ratingValue === '' || ratingValue === null) {
        ratingValue = 
          menteeFeedback['On a scale of 1 to 5 (5 being the best), how would you rate the overall experience of the session?'] ||
          menteeFeedback['"On a scale of 1 to 5 (5 being the best), how would you rate the overall experience of the session?"'] ||
          menteeFeedback['On a scale of 1 to 5'] ||
          menteeFeedback['Overall Rating'] ||
          menteeFeedback['Rating'] ||
          menteeFeedback['rating'] ||
          menteeFeedback['Overall Experience Rating'] ||
          menteeFeedback['Experience Rating'] ||
          '';
      }
      
      // Also try other column positions as fallback (scan all columns for numeric ratings)
      if ((!ratingValue || ratingValue === '' || ratingValue === null) && feedbackKeys.length > 0) {
        // Try common positions for rating columns
        for (let i = 0; i < Math.min(feedbackKeys.length, 10); i++) {
          const val = menteeFeedback[feedbackKeys[i]];
          if (val && val.toString().trim()) {
            const numVal = parseFloat(val.toString().trim().replace(/[^0-9.]/g, ''));
            if (!isNaN(numVal) && numVal >= 1 && numVal <= 5) {
              ratingValue = val;
              break;
            }
          }
        }
      }
      
      const finalRating = ratingValue || '';
      
      if (finalRating && finalRating.toString().trim()) {
        const ratingStr = finalRating.toString().trim();
        // Extract numeric value if it's in a format like "5" or "5.0" or "5 out of 5"
        const numericRating = parseFloat(ratingStr.replace(/[^0-9.]/g, ''));
        if (!isNaN(numericRating) && numericRating >= 1 && numericRating <= 5) {
          updatedSession.menteeFeedback = numericRating.toString();
          
          // Debug logging for first few matches
          if (Math.random() < 0.05) { // Log ~5% of matches to avoid spam
            console.log('Matched mentee feedback to session:', {
              sessionDate: session.date,
              normalizedDate: sessionDateNormalized,
              mentorName: session.mentorName,
              mentorEmail: session.mentorEmail,
              rating: numericRating,
              ratingSource: feedbackKeys.length >= 8 ? `Column H (${feedbackKeys[7]})` : 'Column name/position match',
              allKeys: feedbackKeys.slice(0, 8)
            });
          }
        } else {
          // Log if we found a value but couldn't parse it
          if (Math.random() < 0.1) {
            console.warn('Found rating value but couldn\'t parse:', ratingStr, 'from keys:', feedbackKeys.slice(0, 5));
          }
        }
      } else {
        // Log when we have feedback but no rating value found
        if (Math.random() < 0.05) {
          console.warn('Mentee feedback found but no rating value:', {
            sessionDate: session.date,
            mentorName: session.mentorName,
            feedbackKeys: feedbackKeys.slice(0, 8),
            sampleValues: feedbackKeys.slice(0, 8).map(k => ({ key: k, value: menteeFeedback[k] }))
          });
        }
      }
      
      // Store additional feedback details in comments
      const feedbackDetails: string[] = [];
      
      // Add "Did the mentor join the session on time?"
      const onTime = menteeFeedback['Did the mentor join the session on time?'] || '';
      if (onTime && onTime.toString().trim()) {
        feedbackDetails.push(`Joined on time: ${onTime}`);
      }
      
      // Add facilitation style rating
      const facilitationStyle = menteeFeedback['How would you rate the facilitation style of the mentor? (Did the mentor manage time effectively, paced the session well etc.)'] || '';
      if (facilitationStyle && facilitationStyle.toString().trim()) {
        feedbackDetails.push(`Facilitation style: ${facilitationStyle}`);
      }
      
      // Add quality of feedback rating
      const feedbackQuality = menteeFeedback['How would you rate the quality of the feedback provided? (Did the mentor provide specific, actionable feedback?)'] || '';
      if (feedbackQuality && feedbackQuality.toString().trim()) {
        feedbackDetails.push(`Feedback quality: ${feedbackQuality}`);
      }
      
      // Add suggestions
      const suggestions = menteeFeedback['How could it have been made better and any suggestions for the gradnext team or mentor'] || '';
      if (suggestions && suggestions.toString().trim()) {
        feedbackDetails.push(`Suggestions: ${suggestions}`);
      }
      
      // Merge comments (prefer detailed feedback comments if both exist)
      if (feedbackDetails.length > 0) {
        const existingComments = updatedSession.comments || '';
        updatedSession.comments = feedbackDetails.join(' | ') + (existingComments ? ` | ${existingComments}` : '');
      } else {
        const commentsValue = menteeFeedback['Comments'] || menteeFeedback['comments'] || '';
        if (commentsValue && commentsValue.toString().trim()) {
          updatedSession.comments = commentsValue;
        }
      }
    }

      return updatedSession;
    });
  
  // Summary logging
  const sessionsWithMenteeFeedback = mergedSessions.filter(s => s.menteeFeedback && s.menteeFeedback !== '').length;
  const sessionsWithMentorFeedback = mergedSessions.filter(s => s.mentorFeedback && s.mentorFeedback !== '').length;
  console.log('Feedback matching summary:', {
    totalSessions: mergedSessions.length,
    sessionsWithMenteeFeedback,
    sessionsWithMentorFeedback,
    mentorFeedbackMapSize: mentorFeedbackMap.size,
    candidateFeedbackMapSize: candidateFeedbackMap.size
  });
  
  return mergedSessions;
}

/**
 * Parse mentee directory data
 */
export function parseMenteeData(menteeData: any[]): Mentee[] {
  if (!Array.isArray(menteeData) || menteeData.length === 0) return [];
  
  // Check if first row contains metadata (like "Responder Link", "Edit Link")
  let startIndex = 0;
  if (menteeData.length > 0) {
    const firstRowKeys = Object.keys(menteeData[0]);
    const hasMetadata = firstRowKeys.some(key => 
      key.toLowerCase().includes('responder') || 
      key.toLowerCase().includes('edit link')
    );
    if (hasMetadata && menteeData.length > 1) {
      startIndex = 2; // Skip metadata row and use second row as headers
    }
  }

  return menteeData
    .slice(startIndex)
    .filter(row => {
      const email = row['Email'] || row['email'] || '';
      return email && email.trim() !== '';
    })
    .map((row, index) => ({
      srNo: parseInt(row['Sr. no.'] || row['Sr No'] || row['srNo'] || String(index + 1)) || index + 1,
      name: row['Name'] || row['name'] || '',
      phoneNumber: row['Phone Number'] || row['phoneNumber'] || row['Phone'] || '',
      email: (row['Email'] || row['email'] || '').trim().toLowerCase(),
      linkedin: row['Linkedin'] || row['linkedin'] || row['LinkedIn'] || '',
      minor1: row['Minor 1'] || row['minor1'] || row['Minor1'] || '',
      minor2: row['Minor 2'] || row['minor2'] || row['Minor2'] || '',
  }));
}

/**
 * Parse spreadsheet data from Mesa tracker and merge with feedbacks from two separate sheets
 * @param sessionData - Data from "Mesa tracker" sheet
 * @param mentorFeedbacks - Data from "Mentor Feedback filled by candidates" sheet (optional)
 * @param candidateFeedbacks - Data from "Candidate feedback filled by Mentors" sheet (optional)
 */
export function parseSpreadsheetData(
  sessionData: any,
  mentorFeedbacks?: any,
  candidateFeedbacks?: any
): Session[] {
  console.log('parseSpreadsheetData - Input sessionData type:', typeof sessionData, 'isArray:', Array.isArray(sessionData));
  console.log('parseSpreadsheetData - Input sessionData length:', Array.isArray(sessionData) ? sessionData.length : 0);
  
  const sessions = parseSessionData(Array.isArray(sessionData) ? sessionData : []);
  
  const mentorFeedbackArray = Array.isArray(mentorFeedbacks) ? mentorFeedbacks : [];
  const candidateFeedbackArray = Array.isArray(candidateFeedbacks) ? candidateFeedbacks : [];
  
  console.log('parseSpreadsheetData - After parsing, sessions count:', sessions.length);
  console.log('parseSpreadsheetData - Mentor feedbacks:', mentorFeedbackArray.length);
  console.log('parseSpreadsheetData - Candidate feedbacks:', candidateFeedbackArray.length);
  
  if (mentorFeedbackArray.length > 0 || candidateFeedbackArray.length > 0) {
    const merged = mergeFeedbacksWithSessions(sessions, mentorFeedbackArray, candidateFeedbackArray);
    console.log('parseSpreadsheetData - After merging, final sessions count:', merged.length);
    return merged;
  }

  return sessions;
}
