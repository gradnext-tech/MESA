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
 * @param sessions - Filtered sessions for counting (sessions done, cancelled, etc.)
 * @param allSessionsForRating - All sessions for rating calculation (optional, defaults to sessions)
 */
export function calculateMentorMetrics(sessions: Session[], allSessionsForRating?: Session[], mentorFeedbacks?: any[]): MentorMetrics[] {
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
    // Use column N (mentorFeedbackStatus) from MESA sheet if available, otherwise fallback to checking menteeFeedback
    if (status === 'completed') {
      const feedbackStatus = (session.mentorFeedbackStatus || '').trim().toLowerCase();
      const isFilled = feedbackStatus === 'filled' || feedbackStatus === 'yes' || feedbackStatus === 'done';
      
      if (!isFilled) {
        // If column N is not available or indicates not filled, check menteeFeedback as fallback
        if (!session.mentorFeedbackStatus || 
            (!session.menteeFeedback || session.menteeFeedback === '' || session.menteeFeedback === 'N/A')) {
          metrics.feedbacksFilled++; // Using this field to store "not filled" count
        }
      }
    }
  });

  // Calculate average ratings directly from mentorFeedbacks sheet (if provided)
  // This is the primary source for mentor ratings - feedbacks from candidates about mentors
  // Check if mentorFeedbacks is provided and is a non-empty array
  if (mentorFeedbacks && Array.isArray(mentorFeedbacks) && mentorFeedbacks.length > 0) {
    // Rating column name in the mentor feedbacks sheet
    const ratingColumnName = 'On a scale of 1 to 5 (5 being the best), how would you rate the overall experience of the session?';
    
    // Group feedbacks by mentor name and extract ratings
    const mentorRatingMap = new Map<string, number[]>();
    
    mentorFeedbacks.forEach((feedback) => {
      const mentorName = (feedback['Mentor Name'] || feedback['mentorName'] || '').trim();
      if (!mentorName) return;
      
      // Get rating value
      const ratingValue = feedback[ratingColumnName] || 
                         feedback['Rating'] || 
                         feedback['rating'] ||
                         feedback['Overall Rating'] ||
                         '';
      
      if (!ratingValue) return;
      
      // Parse rating as number
      const ratingStr = String(ratingValue).trim();
      const numericRating = parseFloat(ratingStr.replace(/[^0-9.]/g, ''));
      
      if (!isNaN(numericRating) && numericRating >= 1 && numericRating <= 5) {
        const normalizedMentorName = mentorName.toLowerCase();
        if (!mentorRatingMap.has(normalizedMentorName)) {
          mentorRatingMap.set(normalizedMentorName, []);
        }
        mentorRatingMap.get(normalizedMentorName)!.push(numericRating);
      }
    });
    
    // Apply ratings to mentor metrics by matching mentor names
    mentorMap.forEach((metrics, email) => {
      const normalizedMentorName = (metrics.mentorName || '').trim().toLowerCase();
      let ratings = mentorRatingMap.get(normalizedMentorName) || [];
      
      // If no match by name, try to find by email or alternative name matching
      if (ratings.length === 0) {
        // Try to find feedbacks that might have email matching or name variations
        const feedbacksForMentor = mentorFeedbacks.filter((fb: any) => {
          const fbMentorName = (fb['Mentor Name'] || fb['mentorName'] || '').trim().toLowerCase();
          const fbMentorEmail = (fb['Mentor Email'] || fb['mentorEmail'] || '').trim().toLowerCase();
          
          // Match by exact name
          if (fbMentorName === normalizedMentorName) return true;
          
          // Match by email
          if (fbMentorEmail && email && fbMentorEmail === email) return true;
          
          // Match by partial name (handle cases where names might have slight variations)
          if (fbMentorName && normalizedMentorName) {
            // Check if either name contains the other (for handling middle names, etc.)
            if (fbMentorName.includes(normalizedMentorName) || normalizedMentorName.includes(fbMentorName)) {
              // Only match if they share the same first and last name parts
              const fbNameParts = fbMentorName.split(/\s+/).filter((p: string) => p.length > 0);
              const sessionNameParts = normalizedMentorName.split(/\s+/).filter((p: string) => p.length > 0);
              if (fbNameParts.length > 0 && sessionNameParts.length > 0) {
                // Check if first and last parts match
                if (fbNameParts[0] === sessionNameParts[0] && 
                    fbNameParts[fbNameParts.length - 1] === sessionNameParts[sessionNameParts.length - 1]) {
                  return true;
                }
              }
            }
          }
          
          return false;
        });
        
        // Extract ratings from these feedbacks
        ratings = feedbacksForMentor
          .map((fb: any) => {
            const ratingValue = fb[ratingColumnName] || fb['Rating'] || fb['rating'] || fb['Overall Rating'] || '';
            if (!ratingValue) return null;
            const ratingStr = String(ratingValue).trim();
            const numericRating = parseFloat(ratingStr.replace(/[^0-9.]/g, ''));
            if (!isNaN(numericRating) && numericRating >= 1 && numericRating <= 5) {
              return numericRating;
            }
            return null;
          })
          .filter((r): r is number => r !== null);
      }
      
      if (ratings.length > 0) {
        metrics.avgRating = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10; // Round to 1 decimal
      } else {
        metrics.avgRating = 0;
      }
    });
  } else {
    // Fallback: Try to extract from sessions if mentorFeedbacks not provided
    const sessionsForRating = allSessionsForRating || sessions;
    mentorMap.forEach((metrics, email) => {
      const mentorSessions = sessionsForRating.filter(s => 
        (s.mentorEmail || '').trim().toLowerCase() === email
      );
      
      const ratings = mentorSessions
        .map(s => {
          const feedback = s.menteeFeedback;
          if (!feedback) return null;
          const feedbackStr = String(feedback).trim();
          if (!feedbackStr || feedbackStr === '' || feedbackStr === 'N/A') return null;
          const numericValue = parseFloat(feedbackStr.replace(/[^0-9.]/g, ''));
          if (!isNaN(numericValue) && numericValue >= 1 && numericValue <= 5) {
            return numericValue;
          }
          return null;
        })
        .filter((r): r is number => r !== null && !isNaN(r) && r > 0);
      
      if (ratings.length > 0) {
        metrics.avgRating = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
      } else {
        metrics.avgRating = 0;
      }
    });
  }

  return Array.from(mentorMap.values());
}

/**
 * Calculate Mentee Dashboard Metrics from session data
 */
export function calculateMenteeMetrics(sessions: Session[], weekFilter?: Date, mentees?: Mentee[], candidateFeedbacks?: any[], monthFilter?: string, menteeEmailFilter?: string | string[]): MenteeMetrics {
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

  // Remove mentor-side disruptions for all mentee-facing metrics
  let filteredSessions = sessions.filter(s => !isMentorDisruption(s.sessionStatus));

  // Filter by week if provided
  if (weekFilter) {
    const weekStart = startOfWeek(weekFilter, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekFilter, { weekStartsOn: 1 });
    
    filteredSessions = filteredSessions.filter(session => {
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
  
  // Use all sessions without mentor-side disruptions for comparisons across weeks
  const sessionsWithoutMentorDisruptions = sessions.filter(s => !isMentorDisruption(s.sessionStatus));

  // Get candidates who booked this week (from all sessions, not just filtered)
  const candidatesThisWeek = new Set(
    sessionsWithoutMentorDisruptions
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
    sessionsWithoutMentorDisruptions
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
  // Use ALL sessions without mentor disruptions (not just filtered) to calculate weeks, but use completed sessions for count
  const allCandidateStats = calculateCandidateStats(sessionsWithoutMentorDisruptions);
  const weeksWithSessions = new Set<string>();
  
  
  sessionsWithoutMentorDisruptions.forEach((s) => {
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
  

  // Calculate average rating per week - using mentorFeedback (ratings from mentors about mentees)
  const weeklyRatings: number[] = [];
  const weekRatingMap = new Map<string, number[]>();
  
  
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
    }
  });
  weekRatingMap.forEach((ratings) => {
    const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    weeklyRatings.push(avgRating);
  });
  const avgRatingPerWeek = weeklyRatings.length > 0
    ? weeklyRatings.reduce((a, b) => a + b, 0) / weeklyRatings.length
    : 0;
  

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
    // Normalize email to lowercase for case-insensitive matching
    const email = (session.menteeEmail || '').trim().toLowerCase();
    if (!email) return; // Skip sessions without email
    
    if (!candidateMap.has(email)) {
      candidateMap.set(email, {
        email: session.menteeEmail || '', // Keep original email format for display
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

    // Calculate feedback from mentorFeedback (feedback from mentors about mentees)
    // This comes from the Candidate Feedback sheet
    const feedback = parseFloat(String(session.mentorFeedback));
    if (!isNaN(feedback) && feedback > 0 && feedback <= 5) {
      stats.avgFeedback = (stats.avgFeedback * stats.feedbackCount + feedback) / (stats.feedbackCount + 1);
      stats.feedbackCount++;
    }
  });

  // Calculate completion rates and unique mentors
  candidateMap.forEach((stats, normalizedEmail) => {
    // Match sessions by normalized email (case-insensitive)
    const candidateSessions = sessions.filter(s => 
      (s.menteeEmail || '').trim().toLowerCase() === normalizedEmail
    );
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
 * Optionally uses candidateFeedbacks to calculate accurate average ratings
 */
export function getDetailedCandidateAnalytics(sessions: Session[], candidateFeedbacks?: any[], allSessions?: Session[]): CandidateSessionStats[] {
  const candidateStats = calculateCandidateStats(sessions);
  
  // If candidateFeedbacks are provided, update avgFeedback from the Candidate Feedback sheet
  // This ensures we use the actual Average column from the sheet, not calculated values
  if (candidateFeedbacks && Array.isArray(candidateFeedbacks) && candidateFeedbacks.length > 0) {
    // Group feedbacks by candidate - use a unique identifier (prefer email, fallback to name)
    const candidateRatingData = new Map<string, { ratings: number[]; count: number; email?: string; name?: string }>();
    // Also create a lookup map for both email and name keys
    const candidateKeyMap = new Map<string, string>(); // Maps email/name -> unique key
    
    candidateFeedbacks.forEach((feedback, index) => {
      const candidateName = (feedback['Candidate Name'] || feedback['candidateName'] || '').toLowerCase().trim();
      const candidateEmail = (feedback['Candidate Email'] || feedback['candidateEmail'] || '').toLowerCase().trim();
      
      // Try multiple variations of the Average column
      let averageValue = feedback['Average'] || feedback['average'] || feedback['Avg'] || feedback['avg'];
      
      // If not found, try to find by column position (column M = index 12)
      if (!averageValue) {
        const keys = Object.keys(feedback);
        if (keys.length > 12) {
          averageValue = feedback[keys[12]]; // Column M
        }
      }
      
      
      if (candidateName || candidateEmail) {
        if (averageValue !== null && averageValue !== undefined && averageValue !== '') {
          const avgRating = parseFloat(String(averageValue));
          if (!isNaN(avgRating) && avgRating > 0 && avgRating <= 5) {
            // Use email as primary key, fallback to name
            const uniqueKey = candidateEmail || candidateName;
            
            if (!candidateRatingData.has(uniqueKey)) {
              candidateRatingData.set(uniqueKey, { ratings: [], count: 0, email: candidateEmail || undefined, name: candidateName || undefined });
            }
            const candidateData = candidateRatingData.get(uniqueKey)!;
            candidateData.ratings.push(avgRating);
            candidateData.count++;
            
            
            // Map both email and name to the unique key for lookup
            if (candidateEmail) candidateKeyMap.set(candidateEmail, uniqueKey);
            if (candidateName && candidateName !== candidateEmail) candidateKeyMap.set(candidateName, uniqueKey);
          }
        }
      }
    });
    
    // Update candidate stats with accurate ratings from Candidate Feedback sheet
    candidateStats.forEach((stats) => {
      // Try to match by email first, then by name
      const emailKey = (stats.email || '').toLowerCase().trim();
      const nameKey = (stats.name || '').toLowerCase().trim();
      
      // Find the unique key for this candidate
      let uniqueKey = candidateKeyMap.get(emailKey);
      if (!uniqueKey && nameKey) {
        uniqueKey = candidateKeyMap.get(nameKey);
      }
      
      if (uniqueKey) {
        const candidateData = candidateRatingData.get(uniqueKey);
        if (candidateData && candidateData.ratings.length > 0) {
          // Calculate average from all ratings for this candidate
          const avgRating = candidateData.ratings.reduce((a, b) => a + b, 0) / candidateData.ratings.length;
          stats.avgFeedback = avgRating;
          stats.feedbackCount = candidateData.count;
          
        }
      }
    });
    
    // IMPORTANT: Also add candidates from candidateFeedbacks who might not be in the filtered sessions
    // This ensures we don't miss candidates with high/low ratings who don't have sessions in the current filter
    candidateRatingData.forEach((candidateData, uniqueKey) => {
      const email = candidateData.email || '';
      const name = candidateData.name || '';
      
      // Check if this candidate is already in candidateStats
      const existingStats = candidateStats.find(s => 
        (email && s.email && s.email.toLowerCase().trim() === email.toLowerCase().trim()) ||
        (name && s.name && s.name.toLowerCase().trim() === name.toLowerCase().trim())
      );
      
      if (!existingStats && candidateData.ratings.length > 0) {
        // Create a new candidate stat entry for this candidate from feedback sheet
        const avgRating = candidateData.ratings.reduce((a, b) => a + b, 0) / candidateData.ratings.length;
        
        // Find this candidate in ALL sessions (not just filtered) to get basic info
        const candidateSession = (allSessions || sessions).find(s => 
          (email && s.menteeEmail && s.menteeEmail.toLowerCase().trim() === email.toLowerCase().trim()) ||
          (name && s.menteeName && s.menteeName.toLowerCase().trim() === name.toLowerCase().trim())
        );
        
        const newStats: CandidateSessionStats = {
          email: email || candidateSession?.menteeEmail || '',
          name: name || candidateSession?.menteeName || email || 'Unknown',
          sessionCount: 0, // No sessions in filtered data
          avgFeedback: avgRating,
          feedbackCount: candidateData.count,
          sessionsCancelled: 0,
          sessionsNoShow: 0,
          completedSessions: 0,
          firstSessionDate: candidateSession?.date || '',
          lastSessionDate: candidateSession?.date || '',
          uniqueMentors: 0,
          totalSessionsBooked: 0,
          completionRate: 0,
        };
        
        candidateStats.push(newStats);
      }
    });
  }
  
  // Deduplicate candidates by normalized email (case-insensitive) before returning
  // This ensures candidates with same email but different case are treated as one
  const deduplicatedStats = new Map<string, CandidateSessionStats>();
  
  candidateStats.forEach(stats => {
    const normalizedEmail = (stats.email || '').trim().toLowerCase();
    const normalizedName = (stats.name || '').trim().toLowerCase();
    
    // Skip if no identifier
    if (!normalizedEmail && !normalizedName) return;
    
    // Use email as primary key, fallback to name
    const key = normalizedEmail || normalizedName;
    
    const existing = deduplicatedStats.get(key);
    if (!existing) {
      // First time seeing this candidate
      deduplicatedStats.set(key, stats);
    } else {
      // Duplicate found - merge by keeping the one with more sessions
      if (stats.totalSessionsBooked > existing.totalSessionsBooked) {
        deduplicatedStats.set(key, stats);
      } else if (stats.totalSessionsBooked === existing.totalSessionsBooked) {
        // Same sessions - prefer the one with better data (email, name, feedback)
        if ((stats.email && !existing.email) || 
            (stats.name && !existing.name) ||
            (stats.avgFeedback > existing.avgFeedback)) {
          deduplicatedStats.set(key, stats);
        }
      }
    }
  });
  
  // Sort by total sessions (most active first)
  return Array.from(deduplicatedStats.values()).sort((a, b) => {
    if (b.totalSessionsBooked !== a.totalSessionsBooked) {
      return b.totalSessionsBooked - a.totalSessionsBooked;
    }
    // If equal sessions, sort by name alphabetically
    return (a.name || '').localeCompare(b.name || '');
  });
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
 * @param sessions - Filtered sessions for counting metrics
 * @param weekFilter - Optional week filter
 * @param monthFilter - Optional month filter (YYYY-MM format)
 * @param mentorEmailFilter - Optional mentor email filter
 * @param allSessionsForRating - All sessions for rating calculation (optional, defaults to sessions)
 * @param mentorFeedbacks - Direct mentor feedbacks from the sheet (optional, for direct rating extraction)
 */
export function calculateMentorSessionStats(
  sessions: Session[],
  weekFilter?: Date,
  monthFilter?: string, // Format: YYYY-MM
  mentorEmailFilter?: string | string[],
  allSessionsForRating?: Session[],
  mentorFeedbacks?: any[]
): MentorSessionStats[] {
  // Sessions are already filtered by date in the dashboard, so we just need to filter by mentor if needed
  // The weekFilter and monthFilter parameters are kept for backward compatibility but not used for filtering
  let filteredSessions = sessions;

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
  // Use mentorFeedbacks directly from the sheet if provided (primary source)
  
  const sessionsForRating = allSessionsForRating || filteredSessions;
  mentorMap.forEach((stats, email) => {
    // Get all sessions for this mentor (from filtered sessions for metrics)
    const mentorSessions = filteredSessions.filter(s => 
      (s.mentorEmail || '').trim().toLowerCase() === email
    );
    
    // Calculate average rating directly from mentorFeedbacks sheet (if provided)
    let ratings: number[] = [];
    
    if (Array.isArray(mentorFeedbacks) && mentorFeedbacks.length > 0) {
      // Rating column name in the mentor feedbacks sheet
      const ratingColumnName = 'On a scale of 1 to 5 (5 being the best), how would you rate the overall experience of the session?';
      
      // Get mentor name for matching (normalized)
      const mentorName = (stats.mentorName || '').trim().toLowerCase();
      const normalizedEmail = email.toLowerCase();
      
      
      // Extract ratings from mentorFeedbacks for this mentor
      // Try multiple matching strategies
      const feedbacksForMentor = mentorFeedbacks.filter((fb: any) => {
        const fbMentorName = (fb['Mentor Name'] || fb['mentorName'] || '').trim().toLowerCase();
        const fbMentorEmail = (fb['Mentor Email'] || fb['mentorEmail'] || '').trim().toLowerCase();
        
        // Match by exact name (case-insensitive)
        if (fbMentorName && mentorName && fbMentorName === mentorName) {
          return true;
        }
        // Match by email (case-insensitive)
        if (fbMentorEmail && normalizedEmail && fbMentorEmail === normalizedEmail) {
          return true;
        }
        // Match by partial name (handle cases where names might have slight variations)
        if (fbMentorName && mentorName) {
          // Check if either name contains the other (for handling middle names, etc.)
          if (fbMentorName.includes(mentorName) || mentorName.includes(fbMentorName)) {
            // Only match if they share the same first and last name parts
            const fbNameParts = fbMentorName.split(/\s+/).filter((p: string) => p.length > 0);
            const sessionNameParts = mentorName.split(/\s+/).filter((p: string) => p.length > 0);
            if (fbNameParts.length > 0 && sessionNameParts.length > 0) {
              // Check if first and last parts match
              if (fbNameParts[0] === sessionNameParts[0] && 
                  fbNameParts[fbNameParts.length - 1] === sessionNameParts[sessionNameParts.length - 1]) {
                return true;
              }
            }
          }
        }
        return false;
      });
      
      // Extract ratings from these feedbacks
      ratings = feedbacksForMentor
        .map((fb: any) => {
          const ratingValue = fb[ratingColumnName] || 
                             fb['Rating'] || 
                             fb['rating'] || 
                             fb['Overall Rating'] || 
                             '';
          if (!ratingValue) return null;
          const ratingStr = String(ratingValue).trim();
          const numericRating = parseFloat(ratingStr.replace(/[^0-9.]/g, ''));
          if (!isNaN(numericRating) && numericRating >= 1 && numericRating <= 5) {
            return numericRating;
          }
          return null;
        })
        .filter((r): r is number => r !== null);
    }
    
    // Fallback: Try to extract from sessions if mentorFeedbacks not provided or no ratings found
    if (ratings.length === 0) {
      const mentorSessionsForRating = sessionsForRating.filter(s => 
        (s.mentorEmail || '').trim().toLowerCase() === email
      );
      
      ratings = mentorSessionsForRating
        .map(s => {
          const feedback = s.menteeFeedback;
          if (!feedback) return null;
          const feedbackStr = String(feedback).trim();
          if (!feedbackStr || feedbackStr === '' || feedbackStr === 'N/A' || feedbackStr === 'null' || feedbackStr === 'undefined') {
            return null;
          }
          const numericValue = parseFloat(feedbackStr.replace(/[^0-9.]/g, ''));
          if (!isNaN(numericValue) && numericValue >= 1 && numericValue <= 5) {
            return numericValue;
          }
          const match = feedbackStr.match(/(\d+(?:\.\d+)?)/);
          if (match) {
            const extracted = parseFloat(match[1]);
            if (!isNaN(extracted) && extracted >= 1 && extracted <= 5) {
              return extracted;
            }
          }
          return null;
        })
        .filter((r): r is number => r !== null && !isNaN(r) && r > 0);
    }
    
    if (ratings.length > 0) {
      stats.avgRating = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
    } else {
      stats.avgRating = 0;
    }
    
    // Count feedbacks not filled (completed sessions without feedback)
    // Use column N (mentorFeedbackStatus) from MESA sheet if available
    const completedSessions = mentorSessions.filter(s => 
      normalizeSessionStatus(s.sessionStatus) === 'completed'
    );
    stats.feedbacksNotFilled = completedSessions.filter(s => {
      const feedbackStatus = (s.mentorFeedbackStatus || '').trim().toLowerCase();
      const isFilled = feedbackStatus === 'filled' || feedbackStatus === 'yes' || feedbackStatus === 'done';
      
      // If column N indicates filled, return false (not in "not filled" count)
      if (isFilled) {
        return false;
      }
      
      // If column N is not available, fallback to checking menteeFeedback
      if (!s.mentorFeedbackStatus) {
        return !s.menteeFeedback || s.menteeFeedback === '' || s.menteeFeedback === 'N/A';
      }
      
      // Column N exists and indicates not filled
      return true;
    }).length;
    
  });

  const result = Array.from(mentorMap.values()).sort((a, b) => 
    a.mentorName.localeCompare(b.mentorName)
  );
  
  
  return result;
}

/**
 * Parse Mesa tracker session data to typed objects
 */
function parseSessionData(sessionData: any[]): Session[] {
  if (!Array.isArray(sessionData)) return [];


  const parsed = sessionData
    .filter((row) => {
      // Only include rows that have actual data - at minimum need date and at least one email
      const hasDate = row['Date'] || row['date'];
      const hasMentorEmail = row['Mentor Email ID'] || row['mentorEmail'] || row['Mentor Email'] || row['mentorEmail'];
      const hasMenteeEmail = row['Mentee Email'] || row['menteeEmail'] || row['Candidate Email'] || row['candidateEmail'];
      return hasDate && (hasMentorEmail || hasMenteeEmail);
    })
    .map((row) => {
      // Get column N (14th column, index 13) for mentor feedback status
      // Try by column name first, then by position
      const allKeys = Object.keys(row);
      let mentorFeedbackStatus = '';
      
      // Try common column names for column N
      mentorFeedbackStatus = row['Mentor Feedback Status'] || 
                            row['mentorFeedbackStatus'] || 
                            row['Feedback Status'] || 
                            row['feedbackStatus'] ||
                            row['Mentor Feedback'] ||
                            row['mentorFeedback'] ||
                            '';
      
      // If not found by name, try by column position (Column N = index 13)
      if (!mentorFeedbackStatus && allKeys.length > 13) {
        mentorFeedbackStatus = row[allKeys[13]] || '';
      }
      
      return {
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
      mentorFeedbackStatus: String(mentorFeedbackStatus || '').trim(), // Column N from MESA sheet
    comments: row['Comments'] || row['comments'] || '',
    paymentStatus: row['Payment Status'] || row['paymentStatus'] || '',
      };
    });


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
        let normalizedDate = String(date).split(' ')[0].split('T')[0];
        
        // Try to parse and reformat date - handle MM/DD/YYYY format
        try {
          // Try MM/DD/YYYY format first (common in Google Sheets)
          const parts = normalizedDate.split('/');
          if (parts.length === 3) {
            const month = parseInt(parts[0], 10);
            const day = parseInt(parts[1], 10);
            const year = parseInt(parts[2], 10);
            if (!isNaN(month) && !isNaN(day) && !isNaN(year) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
              // Format directly as YYYY-MM-DD without any Date object conversion to avoid timezone issues
              normalizedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
          } else {
            // Try standard date parsing
            const dateObj = new Date(normalizedDate);
            if (!isNaN(dateObj.getTime())) {
              // Use local date components to avoid timezone issues
              const year = dateObj.getFullYear();
              const month = dateObj.getMonth() + 1;
              const day = dateObj.getDate();
              normalizedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
          }
        } catch (e) {
          // Keep original format if parsing fails
        }
        
        const normalizedMentorName = String(mentorName).trim().toLowerCase();
        const key = `${normalizedDate}|${normalizedMentorName}`;
        mentorFeedbackMap.set(key, feedback);
        
        // Create multiple key variations for better matching
        // Original date format
        const originalDate = String(date).split(' ')[0].split('T')[0];
        if (originalDate !== normalizedDate) {
          mentorFeedbackMap.set(`${originalDate}|${normalizedMentorName}`, feedback);
        }
        
        // Date with slashes
        const dateWithSlashes = normalizedDate.replace(/-/g, '/');
        if (dateWithSlashes !== normalizedDate) {
          mentorFeedbackMap.set(`${dateWithSlashes}|${normalizedMentorName}`, feedback);
        }
        
        // Also create key with original MM/DD/YYYY format for direct matching
        const dateParts = String(date).split(' ')[0].split('T')[0].split('/');
        if (dateParts.length === 3) {
          const originalDateStr = dateParts.join('/');
          mentorFeedbackMap.set(`${originalDateStr}|${normalizedMentorName}`, feedback);
        }
        
        // Also try with date in different formats for matching
        try {
          // Parse the normalized YYYY-MM-DD date back to components
          const normalizedParts = normalizedDate.split('-');
          if (normalizedParts.length === 3) {
            const year = parseInt(normalizedParts[0], 10);
            const month = parseInt(normalizedParts[1], 10);
            const day = parseInt(normalizedParts[2], 10);
            if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
              // MM/DD/YYYY format
              const mmddyyyy = `${month}/${day}/${year}`;
              mentorFeedbackMap.set(`${mmddyyyy}|${normalizedMentorName}`, feedback);
            }
          }
        } catch (e) {
          // Ignore date formatting errors
        }
        
      }
    });
    
  }

  // Process "Candidate feedback filled by Mentors" (mentor feedback about mentee)
  // This sheet contains feedback from mentors about mentees
  // Column structure: Timestamp, Mentor Name, Candidate Name, Session Date, Case, Difficulty, Rating on scoping questions, Rating on case setup and structure, Rating on quantitative ability (if not tested, rate 1), Rating on communication and confidence, Rating on business acumen and creativity, Overall strength and areas of improvement
  if (Array.isArray(candidateFeedbacks) && candidateFeedbacks.length > 0) {
    
    candidateFeedbacks.forEach((feedback, index) => {
      
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
        
      }
    });
    
  }

  // Merge feedbacks into sessions - only use actual values from sheets
  let debugCompletedWithoutFeedbackCount = 0; // Track count for debugging
  const mergedSessions = sessions.map((session) => {
    // Normalize session date for consistent matching - handle MM/DD/YYYY format
    let sessionDateNormalized = String(session.date).split(' ')[0].split('T')[0];
    
    try {
      // Try MM/DD/YYYY format first (common in spreadsheets)
      const parts = sessionDateNormalized.split('/');
      if (parts.length === 3) {
        const month = parseInt(parts[0], 10);
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        if (!isNaN(month) && !isNaN(day) && !isNaN(year) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          // Format directly as YYYY-MM-DD without timezone conversion
          sessionDateNormalized = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      } else {
        // Try standard date parsing
        const dateObj = new Date(sessionDateNormalized);
        if (!isNaN(dateObj.getTime())) {
          // Use local date components to avoid timezone issues
          const year = dateObj.getFullYear();
          const month = dateObj.getMonth() + 1;
          const day = dateObj.getDate();
          sessionDateNormalized = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
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
    
    // Try multiple matching strategies for mentor feedbacks
    const normalizedMentorName = session.mentorName ? String(session.mentorName).trim().toLowerCase() : '';
    const originalDate = String(session.date).split(' ')[0].split('T')[0];
    
    // Strategy 1: Try with normalized date and mentor name (primary matching)
    if (normalizedMentorName) {
      const nameKey = `${sessionDateNormalized}|${normalizedMentorName}`;
      menteeFeedback = mentorFeedbackMap.get(nameKey);
    }
    
    // Strategy 2: Try with original date format and mentor name
    if (!menteeFeedback && normalizedMentorName) {
      const originalNameKey = `${originalDate}|${normalizedMentorName}`;
      menteeFeedback = mentorFeedbackMap.get(originalNameKey);
    }
    
    // Strategy 3: Try with date in MM/DD/YYYY format
    if (!menteeFeedback && normalizedMentorName) {
      try {
        const dateObj = new Date(sessionDateNormalized);
        if (!isNaN(dateObj.getTime())) {
          const mmddyyyy = `${dateObj.getMonth() + 1}/${dateObj.getDate()}/${dateObj.getFullYear()}`;
          const mmddyyyyKey = `${mmddyyyy}|${normalizedMentorName}`;
          menteeFeedback = mentorFeedbackMap.get(mmddyyyyKey);
        }
      } catch (e) {
        // Ignore
      }
    }
    
    // Strategy 4: Try alternative date formats with mentor name
    if (!menteeFeedback && normalizedMentorName) {
      const altDate = sessionDateNormalized.replace(/-/g, '/');
      const altKey = `${altDate}|${normalizedMentorName}`;
      menteeFeedback = mentorFeedbackMap.get(altKey);
    }
    
    // Strategy 5: Try with mentor email if available
    if (!menteeFeedback && session.mentorEmail) {
      const normalizedEmail = String(session.mentorEmail).trim().toLowerCase();
      const emailKey = `${sessionDateNormalized}|${normalizedEmail}`;
      menteeFeedback = mentorFeedbackMap.get(emailKey);
    }
    
    // Strategy 6: Try with original date and mentor email
    if (!menteeFeedback && session.mentorEmail) {
      const normalizedEmail = String(session.mentorEmail).trim().toLowerCase();
      const emailKey = `${originalDate}|${normalizedEmail}`;
      menteeFeedback = mentorFeedbackMap.get(emailKey);
    }
    
    // Strategy 7: Try with MM/DD/YYYY date and mentor email
    if (!menteeFeedback && session.mentorEmail) {
      try {
        const dateObj = new Date(sessionDateNormalized);
        if (!isNaN(dateObj.getTime())) {
          const mmddyyyy = `${dateObj.getMonth() + 1}/${dateObj.getDate()}/${dateObj.getFullYear()}`;
          const normalizedEmail = String(session.mentorEmail).trim().toLowerCase();
          const emailKey = `${mmddyyyy}|${normalizedEmail}`;
          menteeFeedback = mentorFeedbackMap.get(emailKey);
        }
      } catch (e) {
        // Ignore
      }
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
      
      // First, try to get by column name (most reliable)
      let ratingValue = 
        menteeFeedback['On a scale of 1 to 5 (5 being the best), how would you rate the overall experience of the session?'] ||
        menteeFeedback['"On a scale of 1 to 5 (5 being the best), how would you rate the overall experience of the session?"'] ||
        menteeFeedback['On a scale of 1 to 5'] ||
        menteeFeedback['Overall Rating'] ||
        menteeFeedback['Rating'] ||
        menteeFeedback['rating'] ||
        menteeFeedback['Overall Experience Rating'] ||
        menteeFeedback['Experience Rating'] ||
        null;
      
      // If not found by name, try by column position (H = 8th column, index 7)
      if ((!ratingValue || ratingValue === '' || ratingValue === null) && feedbackKeys.length >= 8) {
        ratingValue = menteeFeedback[feedbackKeys[7]];
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
  const sessions = parseSessionData(Array.isArray(sessionData) ? sessionData : []);
  
  const mentorFeedbackArray = Array.isArray(mentorFeedbacks) ? mentorFeedbacks : [];
  const candidateFeedbackArray = Array.isArray(candidateFeedbacks) ? candidateFeedbacks : [];
  
  if (mentorFeedbackArray.length > 0 || candidateFeedbackArray.length > 0) {
    const merged = mergeFeedbacksWithSessions(sessions, mentorFeedbackArray, candidateFeedbackArray);
    return merged;
  }

  return sessions;
}
