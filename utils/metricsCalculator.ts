import { Session, MentorMetrics, StudentMetrics, CandidateSessionStats, Student } from '@/types';
import { parseISO, differenceInDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, parse, isWithinInterval, startOfDay, format } from 'date-fns';

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
  if (value === 'completed' || value === 'done' || value === 'session done' || value === 'session completed') return 'completed';

  // Handle pending
  if (value === 'pending') return 'pending';

  // Determine who caused the disruption (mentor vs student/mentee/candidate vs admin)
  const hasMentor = value.includes('mentor');
  const hasAdmin = value.includes('admin');
  const hasStudentSide = value.includes('student') || value.includes('mentee') || value.includes('candidate');

  const isNoShow = value.includes('no show') || value.includes('no-show') || value.includes('noshow');
  const isCancel = value.includes('cancel');
  // Be tolerant to typos like "resheduled"
  const isReschedule = value.includes('resch') || value.includes('re-schedule');

  // No-show
  if (isNoShow) {
    if (hasMentor) return 'mentor_no_show';
    // Admin no-show isn't tracked separately; treat as unknown
    if (hasAdmin) return 'unknown';
    // If it doesn't explicitly say mentor/admin, treat as student-side no-show
    return 'student_no_show';
  }

  // Cancelled
  if (isCancel) {
    if (hasMentor) return 'mentor_cancelled';
    if (hasAdmin) return 'admin_cancelled';
    // If it doesn't explicitly say mentor/admin, treat as student-side cancellation
    return 'student_cancelled';
  }

  // Rescheduled
  if (isReschedule) {
    if (hasMentor) return 'mentor_rescheduled';
    if (hasAdmin) return 'admin_rescheduled';
    // If it doesn't explicitly say mentor/admin, treat as student-side reschedule
    return 'student_rescheduled';
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
    if (status === 'completed') {
      const feedbackStatus = (session.mentorFeedbackStatus || '').trim().toLowerCase();
      const isFilledStatus = feedbackStatus === 'filled' || feedbackStatus === 'yes' || feedbackStatus === 'done';

      if (!isFilledStatus) {
        // If column N indicates not filled or is missing, check studentFeedback as fallback
        const hasActualFeedback = session.studentFeedback &&
          String(session.studentFeedback).trim() !== '' &&
          String(session.studentFeedback).trim() !== 'N/A' &&
          String(session.studentFeedback).trim() !== 'null' &&
          String(session.studentFeedback).trim() !== 'undefined';

        if (!hasActualFeedback) {
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

    // Group feedbacks by mentor name and email - extract ratings
    const mentorRatingMap = new Map<string, number[]>();
    const mentorEmailRatingMap = new Map<string, number[]>();

    mentorFeedbacks.forEach((feedback) => {
      const mentorName = (feedback['Mentor Name'] || feedback['mentorName'] || '').trim();
      const mentorEmail = (feedback['Mentor Email'] || feedback['mentorEmail'] || feedback['Mentor Email ID'] || '').trim();

      if (!mentorName && !mentorEmail) return;

      // Get rating value - try by known column names only
      const ratingValue = feedback[ratingColumnName] ||
        feedback['Rating'] ||
        feedback['rating'] ||
        feedback['Overall Rating'] ||
        feedback['overall rating'] ||
        '';

      if (!ratingValue || ratingValue === '') return;

      // Parse rating as number
      const ratingStr = String(ratingValue).trim();
      const numericRating = parseFloat(ratingStr.replace(/[^0-9.]/g, ''));

      if (!isNaN(numericRating) && numericRating >= 1 && numericRating <= 5) {
        // Store by name
        if (mentorName) {
          const normalizedMentorName = mentorName.toLowerCase();
          if (!mentorRatingMap.has(normalizedMentorName)) {
            mentorRatingMap.set(normalizedMentorName, []);
          }
          mentorRatingMap.get(normalizedMentorName)!.push(numericRating);
        }

        // Store by email
        if (mentorEmail) {
          const normalizedMentorEmail = mentorEmail.toLowerCase();
          if (!mentorEmailRatingMap.has(normalizedMentorEmail)) {
            mentorEmailRatingMap.set(normalizedMentorEmail, []);
          }
          mentorEmailRatingMap.get(normalizedMentorEmail)!.push(numericRating);
        }
      }
    });

    // Apply ratings to mentor metrics by matching mentor names and emails
    mentorMap.forEach((metrics, email) => {
      const normalizedMentorName = (metrics.mentorName || '').trim().toLowerCase();

      // Try matching by name first
      let ratings = mentorRatingMap.get(normalizedMentorName) || [];

      // If no match by name, try matching by email
      if (ratings.length === 0 && email) {
        ratings = mentorEmailRatingMap.get(email) || [];
      }

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
            const ratingValue =
              fb[ratingColumnName] ||
              fb['Rating'] ||
              fb['rating'] ||
              fb['Overall Rating'] ||
              fb['overall rating'] ||
              '';

            if (!ratingValue || ratingValue === '') return null;
            const ratingStr = String(ratingValue).trim();
            const numericRating = parseFloat(ratingStr.replace(/[^0-9.]/g, ''));
            if (!isNaN(numericRating) && numericRating >= 1 && numericRating <= 5) {
              return numericRating;
            }
            return null;
          })
          .filter((r): r is number => r !== null);
      }

      // Only show a rating if the mentor has at least one completed session.
      if (ratings.length > 0 && metrics.sessionsDone > 0) {
        metrics.avgRating =
          Math.round(
            (ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10
          ) / 10; // Round to 1 decimal
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
          const feedback = s.studentFeedback;
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

      // Only show a rating if the mentor has at least one completed session.
      // This prevents showing ratings for mentors who don't have any completed sessions
      // in the Mesa tracker data (which can feel misleading on the dashboard).
      if (ratings.length > 0 && metrics.sessionsDone > 0) {
        metrics.avgRating =
          Math.round(
            (ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10
          ) / 10;
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
export function calculateStudentMetrics(sessions: Session[], weekFilter?: Date, students?: Student[], candidateFeedbacks?: any[], monthFilter?: string, studentEmailFilter?: string | string[]): StudentMetrics {
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

  // Remove mentor-side disruptions for all student-facing metrics
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

  // Filter by student email(s) if provided
  if (studentEmailFilter) {
    const filterEmails = Array.isArray(studentEmailFilter) ? studentEmailFilter : [studentEmailFilter];
    if (filterEmails.length > 0) {
      const normalizedFilterEmails = filterEmails.map(e => (e || '').trim().toLowerCase()).filter(e => e);
      filteredSessions = filteredSessions.filter(session => {
        const sessionEmail = (session.studentEmail || '').trim().toLowerCase();
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
  const uniqueCandidates = new Set(filteredSessions.map(s => s.studentEmail));
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
        if (!s.studentEmail) return false;
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
      .map(s => s.studentEmail)
      .filter(email => email && email.trim() !== '') // Filter out empty emails
  );

  // Get candidates who booked last week
  const candidatesLastWeek = new Set(
    sessionsWithoutMentorDisruptions
      .filter(s => {
        if (!s.studentEmail) return false;
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
      .map(s => s.studentEmail)
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

  // Average feedback score - read directly from column L "Overall Rating" in candidate feedbacks
  // Average feedback score - read directly from column L "Overall Rating" in candidate feedbacks
  // Apply the same filters as applied to sessions
  const feedbackScores: Array<{ val: number; date: number }> = [];

  if (candidateFeedbacks && Array.isArray(candidateFeedbacks) && candidateFeedbacks.length > 0) {
    // Get all keys from first feedback to find the Overall Rating column
    const firstFeedback = candidateFeedbacks[0];
    const allKeys = Object.keys(firstFeedback);

    // Column L is the 12th column (index 11)
    // Try to find column by name first: "Overall Rating"
    let averageKey: string | null = null;
    for (const key of allKeys) {
      if (key.toLowerCase() === 'overall rating' ||
        key.toLowerCase() === 'overallrating' ||
        key.toLowerCase().includes('overall') && key.toLowerCase().includes('rating')) {
        averageKey = key;
        break;
      }
    }

    // If not found by name, try column L (12th column, index 11)
    if (!averageKey && allKeys.length > 11) {
      averageKey = allKeys[11]; // Column L (0-indexed: 11)
    }

    if (averageKey) {
      // Filter candidateFeedbacks by the same criteria as sessions
      candidateFeedbacks.forEach((feedback) => {
        let includeThisFeedback = true;

        // Apply week filter
        if (weekFilter && includeThisFeedback) {
          const feedbackDate = feedback['Session Date'] || feedback['sessionDate'] || feedback['Date'] || feedback['date'] || '';
          if (feedbackDate) {
            const feedbackDateParsed = parseSessionDate(feedbackDate);
            if (feedbackDateParsed) {
              const weekStart = startOfWeek(weekFilter, { weekStartsOn: 1 });
              const weekEnd = endOfWeek(weekFilter, { weekStartsOn: 1 });
              const feedbackDateNormalized = startOfDay(feedbackDateParsed);
              includeThisFeedback = isWithinInterval(feedbackDateNormalized, {
                start: startOfDay(weekStart),
                end: startOfDay(weekEnd),
              });
            } else {
              includeThisFeedback = false; // Can't parse date, exclude
            }
          } else {
            includeThisFeedback = false; // No date, exclude
          }
        }

        // Apply month filter
        if (monthFilter && includeThisFeedback) {
          const feedbackDate = feedback['Session Date'] || feedback['sessionDate'] || feedback['Date'] || feedback['date'] || '';
          if (feedbackDate) {
            const feedbackDateParsed = parseSessionDate(feedbackDate);
            if (feedbackDateParsed) {
              const monthDate = new Date(monthFilter + '-01');
              const monthStart = startOfMonth(monthDate);
              const monthEnd = endOfMonth(monthDate);
              const feedbackDateNormalized = startOfDay(feedbackDateParsed);
              includeThisFeedback = isWithinInterval(feedbackDateNormalized, {
                start: startOfDay(monthStart),
                end: startOfDay(monthEnd),
              });
            } else {
              includeThisFeedback = false; // Can't parse date, exclude
            }
          } else {
            includeThisFeedback = false; // No date, exclude
          }
        }

        // Apply student email filter - match by names only since Candidate Feedback sheet has no email
        if (studentEmailFilter && includeThisFeedback) {
          const filterEmails = Array.isArray(studentEmailFilter) ? studentEmailFilter : [studentEmailFilter];
          if (filterEmails.length > 0) {
            const normalizedFilterEmails = filterEmails.map(e => (e || '').trim().toLowerCase()).filter(e => e);
            const feedbackCandidateName = (feedback['Candidate Name'] || feedback['candidateName'] || feedback['Candidate'] || feedback['candidate'] || feedback['Mentee Name'] || feedback['studentName'] || '').trim().toLowerCase();

            // Get the names from sessions that match the filter emails
            const filterNames = filteredSessions
              .filter(s => normalizedFilterEmails.includes((s.studentEmail || '').trim().toLowerCase()))
              .map(s => (s.studentName || '').trim().toLowerCase())
              .filter(n => n);

            // Match by name (exact match or partial match)
            const nameMatch = feedbackCandidateName && (
              filterNames.includes(feedbackCandidateName) ||
              // Partial name matching (first name + last name)
              filterNames.some(filterName => {
                if (feedbackCandidateName.split(/\s+/).length > 0 && filterName.split(/\s+/).length > 0) {
                  const feedbackFirstName = feedbackCandidateName.split(/\s+/)[0];
                  const feedbackLastName = feedbackCandidateName.split(/\s+/).pop();
                  const filterFirstName = filterName.split(/\s+/)[0];
                  const filterLastName = filterName.split(/\s+/).pop();
                  return feedbackFirstName === filterFirstName && feedbackLastName === filterLastName;
                }
                return false;
              })
            );

            includeThisFeedback = nameMatch;
          }
        }

        // If this feedback passes all filters, include its average value
        if (includeThisFeedback) {
          const averageValue = feedback[averageKey];
          if (averageValue !== null && averageValue !== undefined && averageValue !== '') {
            const avgRating = parseFloat(String(averageValue));
            if (!isNaN(avgRating) && avgRating > 0 && avgRating <= 5) {
              // Extract date for sorting
              const feedbackDate = feedback['Session Date'] || feedback['sessionDate'] || feedback['Date'] || feedback['date'] || '';
              const feedbackDateParsed = parseSessionDate(feedbackDate);
              const timestamp = feedbackDateParsed ? feedbackDateParsed.getTime() : 0;

              feedbackScores.push({ val: avgRating, date: timestamp });
            }
          }
        }
      });
    }
  }

  // Calculate average of LAST 5 feedbacks
  feedbackScores.sort((a, b) => b.date - a.date);
  const last5Feedbacks = feedbackScores.slice(0, 5);

  const avgFeedbackScore = last5Feedbacks.length > 0
    ? last5Feedbacks.reduce((a, b) => a + b.val, 0) / last5Feedbacks.length
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


  // Calculate average rating per week - using mentorFeedback (ratings from mentors about students)
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
      const averageValue = feedback['Overall Rating'] ||
        feedback['overall rating'] ||
        feedback['Overall rating'] ||
        feedback['overallRating'] ||
        feedback['Average'] ||
        feedback['average'];

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
          sessionsRescheduled: matchingStats?.sessionsRescheduled || 0,
          completedSessions: matchingStats?.completedSessions || 0,
          firstSessionDate: matchingStats?.firstSessionDate || '',
          lastSessionDate: matchingStats?.lastSessionDate || '',
          uniqueMentors: matchingStats?.uniqueMentors || 0,
          completionRate: matchingStats?.completionRate || 0,
        });
      }
    });

    // Filter candidates with rating > 4.75 (not just top 10% by count)
    const topPerformers = candidatesWithRatings.filter(c => c.avgFeedback > 4.75);
    const sortedByRating = [...topPerformers].sort((a, b) => b.avgFeedback - a.avgFeedback);
    top10ByRating = sortedByRating;
  } else {
    // Fallback to old method if no candidateFeedbacks - filter by rating > 4.75
    const candidatesWithRatings = allCandidateStats.filter(c => c.avgFeedback > 4.75);
    const sortedByRating = [...candidatesWithRatings].sort((a, b) => b.avgFeedback - a.avgFeedback);
    top10ByRating = sortedByRating;
  }

  // Bottom candidates by feedback - filter by rating < 3.5 (not by percentage)
  // First, try to get ratings from candidateFeedbacks sheet if available
  let bottom10Feedback: CandidateSessionStats[] = [];
  let bottom25Feedback: CandidateSessionStats[] = [];

  if (candidateFeedbacks && Array.isArray(candidateFeedbacks) && candidateFeedbacks.length > 0) {
    // Group feedbacks by candidate email/name and calculate average rating from Column L "Overall Rating"
    const candidateRatingMap = new Map<string, { name: string; email: string; ratings: number[]; count: number }>();

    candidateFeedbacks.forEach((feedback) => {
      const candidateName = feedback['Candidate Name'] || feedback['candidateName'] || '';
      const candidateEmail = feedback['Candidate Email'] || feedback['candidateEmail'] || '';
      const overallRating = feedback['Overall Rating'] ||
        feedback['overall rating'] ||
        feedback['Overall rating'] ||
        feedback['overallRating'];

      // If not found by name, try by column position (L = 12th column, index 11)
      let ratingValue = overallRating;
      if (!ratingValue) {
        const keys = Object.keys(feedback);
        if (keys.length > 11) {
          ratingValue = feedback[keys[11]]; // Column L
        }
      }

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
        if (ratingValue !== null && ratingValue !== undefined && ratingValue !== '') {
          const avgRating = parseFloat(String(ratingValue));
          if (!isNaN(avgRating) && avgRating > 0 && avgRating <= 5) {
            candidateData.ratings.push(avgRating);
            candidateData.count++;
          }
        }
      }
    });

    // Calculate average for each candidate and filter by rating thresholds
    const candidatesWithLowRatings: CandidateSessionStats[] = [];
    candidateRatingMap.forEach((data, key) => {
      if (data.ratings.length > 0) {
        const avgRating = data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length;

        // Only include candidates with rating < 3.5
        if (avgRating < 3.5) {
          // Find matching candidate stats to get session count
          const matchingStats = allCandidateStats.find(c =>
            (c.email && c.email.toLowerCase().trim() === key) ||
            (c.name && c.name.toLowerCase().trim() === key)
          );

          candidatesWithLowRatings.push({
            name: data.name || matchingStats?.name || 'Unknown',
            email: data.email || matchingStats?.email || '',
            sessionCount: matchingStats?.sessionCount || 0,
            totalSessionsBooked: matchingStats?.totalSessionsBooked || 0,
            avgFeedback: avgRating,
            feedbackCount: data.count,
            sessionsCancelled: matchingStats?.sessionsCancelled || 0,
            sessionsNoShow: matchingStats?.sessionsNoShow || 0,
            sessionsRescheduled: matchingStats?.sessionsRescheduled || 0,
            completedSessions: matchingStats?.completedSessions || 0,
            firstSessionDate: matchingStats?.firstSessionDate || '',
            lastSessionDate: matchingStats?.lastSessionDate || '',
            uniqueMentors: matchingStats?.uniqueMentors || 0,
            completionRate: matchingStats?.completionRate || 0,
          });
        }
      }
    });

    // Sort by rating (lowest first)
    const sortedByRating = [...candidatesWithLowRatings].sort((a, b) => a.avgFeedback - b.avgFeedback);

    // For backward compatibility:
    // bottom10Feedback = all candidates with rating < 3.5
    // bottom25Feedback = all candidates with rating < 3.5 (same list)
    bottom10Feedback = sortedByRating;
    bottom25Feedback = sortedByRating;
  } else {
    // Fallback: use old method with percentages if candidateFeedbacks not available
    const candidatesWithFeedback = allCandidateStats.filter(c => c.feedbackCount > 0 && c.avgFeedback < 3.5);
    const sortedByFeedbackAsc = [...candidatesWithFeedback].sort((a, b) => a.avgFeedback - b.avgFeedback);
    bottom10Feedback = sortedByFeedbackAsc;
    bottom25Feedback = sortedByFeedbackAsc;
  }

  // Candidates with no sessions booked (from student directory)
  const candidatesNoSessions: Student[] = [];
  if (students && students.length > 0) {
    const candidatesWithSessions = new Set(sessions.map(s => (s.studentEmail || '').trim().toLowerCase()).filter(e => e));
    students.forEach(student => {
      const studentEmail = (student.email || '').trim().toLowerCase();
      if (studentEmail && !candidatesWithSessions.has(studentEmail)) {
        candidatesNoSessions.push(student);
      }
    });
  }

  // Cancelled and No-shows (only student/candidate no-shows for student metrics)
  const cancelledSessions = filteredSessions.filter(
    (s) => normalizeSessionStatus(s.sessionStatus) === 'student_cancelled'
  );
  const noShowSessions = filteredSessions.filter((s) => {
    const status = normalizeSessionStatus(s.sessionStatus);
    return status === 'student_no_show'; // Only count student/candidate no-shows
  });

  const rescheduledSessions = filteredSessions.filter((s) => {
    // Use normalized status for consistent matching
    const status = normalizeSessionStatus(s.sessionStatus);
    // Only count student rescheduled (not mentor or admin)
    return status === 'student_rescheduled';
  });

  const totalSessionsCancelled = cancelledSessions.length;
  const totalNoShows = noShowSessions.length;
  const totalSessionsRescheduled = rescheduledSessions.length;

  const candidatesCancelled = new Set(cancelledSessions.map(s => s.studentEmail)).size;
  const candidatesNoShow = new Set(noShowSessions.map(s => s.studentEmail)).size;
  const candidatesRescheduled = new Set(rescheduledSessions.map(s => s.studentEmail)).size;

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
  // Store ratings with dates for last-5 calculation
  const candidateRatings = new Map<string, Array<{ rating: number; date: number }>>();

  sessions.forEach(session => {
    // Normalize email to lowercase for case-insensitive matching
    const email = (session.studentEmail || '').trim().toLowerCase();
    if (!email) return; // Skip sessions without email

    if (!candidateMap.has(email)) {
      candidateMap.set(email, {
        email: session.studentEmail || '', // Keep original email format for display
        name: session.studentName,
        sessionCount: 0,
        avgFeedback: 0,
        feedbackCount: 0,
        sessionsCancelled: 0,
        sessionsNoShow: 0,
        sessionsRescheduled: 0,
        completedSessions: 0,
        firstSessionDate: session.date,
        lastSessionDate: session.date,
        uniqueMentors: 0,
        totalSessionsBooked: 0,
        completionRate: 0,
      });
      candidateRatings.set(email, []);
    }

    const stats = candidateMap.get(email)!;

    // Count this session in the raw session count (includes pending)
    stats.sessionCount++;

    // Normalized status for downstream calculations
    const status = normalizeSessionStatus(session.sessionStatus);

    // Only count non-pending sessions as "booked" for completion rate
    // This ensures pending/future sessions don't reduce the completion percentage
    if (status !== 'pending') {
      stats.totalSessionsBooked++;
    }

    // Update date range
    if (session.date < stats.firstSessionDate) {
      stats.firstSessionDate = session.date;
    }
    if (session.date > stats.lastSessionDate) {
      stats.lastSessionDate = session.date;
    }

    // Count session types using normalised status
    if (status === 'completed') {
      stats.completedSessions++;
    } else if (status === 'student_cancelled') {
      stats.sessionsCancelled++;
    } else if (status === 'student_no_show') {
      // Only count student/candidate no-shows for candidate stats
      stats.sessionsNoShow++;
    } else if (status === 'student_rescheduled') {
      // Count student rescheduled sessions
      stats.sessionsRescheduled++;
    }

    // Calculate feedback from mentorFeedback (feedback from mentors about students)
    // This comes from the Candidate Feedback sheet
    const feedback = parseFloat(String(session.mentorFeedback));
    if (!isNaN(feedback) && feedback > 0 && feedback <= 5) {
      const dateObj = parseSessionDate(session.date);
      const timestamp = dateObj ? dateObj.getTime() : 0;
      candidateRatings.get(email)!.push({ rating: feedback, date: timestamp });
      stats.feedbackCount++;
    }
  });

  // Calculate completion rates, unique mentors, and avg feedback (Last 5)
  candidateMap.forEach((stats, normalizedEmail) => {
    // Match sessions by normalized email (case-insensitive)
    const candidateSessions = sessions.filter(s =>
      (s.studentEmail || '').trim().toLowerCase() === normalizedEmail
    );
    const uniqueMentorEmails = new Set(candidateSessions.map(s => s.mentorEmail));
    stats.uniqueMentors = uniqueMentorEmails.size;

    if (stats.totalSessionsBooked > 0) {
      stats.completionRate = (stats.completedSessions / stats.totalSessionsBooked) * 100;
    }

    // Average of last 5 feedbacks
    const ratings = candidateRatings.get(normalizedEmail) || [];
    if (ratings.length > 0) {
      // Sort returning latest first
      ratings.sort((a, b) => b.date - a.date);
      const latest5 = ratings.slice(0, 5);
      const sum = latest5.reduce((acc, curr) => acc + curr.rating, 0);
      stats.avgFeedback = sum / latest5.length;
    } else {
      stats.avgFeedback = 0;
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
 * Get detailed candidate analytics for student dashboard table
 * Optionally uses candidateFeedbacks to calculate accurate average ratings
 */
export function getDetailedCandidateAnalytics(sessions: Session[], candidateFeedbacks?: any[], allSessions?: Session[]): CandidateSessionStats[] {
  const candidateStats = calculateCandidateStats(sessions);

  // If candidateFeedbacks are provided, update avgFeedback from the Candidate Feedback sheet
  // This ensures we use the actual Average column from the sheet, not calculated values
  if (candidateFeedbacks && Array.isArray(candidateFeedbacks) && candidateFeedbacks.length > 0) {
    // Group feedbacks by candidate - use a unique identifier (prefer email, fallback to name)
    const candidateRatingData = new Map<string, { ratings: Array<{ val: number, date: number }>; count: number; email?: string; name?: string }>();
    // Also create a lookup map for both email and name keys
    const candidateKeyMap = new Map<string, string>(); // Maps email/name -> unique key

    candidateFeedbacks.forEach((feedback, index) => {
      const candidateName = (feedback['Candidate Name'] || feedback['candidateName'] || '').toLowerCase().trim();
      const candidateEmail = (feedback['Candidate Email'] || feedback['candidateEmail'] || '').toLowerCase().trim();

      // Use column L "Overall Rating" from "Candidate feedback form filled by mentors" sheet
      let averageValue = feedback['Overall Rating'] ||
        feedback['overall rating'] ||
        feedback['Overall rating'] ||
        feedback['overallRating'] ||
        feedback['Average'] ||
        feedback['average'];

      // If not found, try to find by column position (column L = index 11)
      if (!averageValue) {
        const keys = Object.keys(feedback);
        if (keys.length > 11) {
          averageValue = feedback[keys[11]]; // Column L
        }
      }

      // Extract Date for sorting
      const dateVal = feedback['Session Date'] || feedback['sessionDate'] || feedback['Date'] || feedback['date'] || '';
      const dateObj = parseSessionDate(dateVal);
      const timestamp = dateObj ? dateObj.getTime() : 0;


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
            candidateData.ratings.push({ val: avgRating, date: timestamp });
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
          // Calculate average from last 5 ratings for this candidate
          const sortedRatings = candidateData.ratings.sort((a, b) => b.date - a.date);
          const latest5 = sortedRatings.slice(0, 5);
          const avgRating = latest5.reduce((a, b) => a + b.val, 0) / latest5.length;

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
        const sortedRatings = candidateData.ratings.sort((a, b) => b.date - a.date);
        const latest5 = sortedRatings.slice(0, 5);
        const avgRating = latest5.reduce((a, b) => a + b.val, 0) / latest5.length;

        // Find this candidate in ALL sessions (not just filtered) to get basic info
        const candidateSession = (allSessions || sessions).find(s =>
          (email && s.studentEmail && s.studentEmail.toLowerCase().trim() === email.toLowerCase().trim()) ||
          (name && s.studentName && s.studentName.toLowerCase().trim() === name.toLowerCase().trim())
        );

        const newStats: CandidateSessionStats = {
          email: email || candidateSession?.studentEmail || '',
          name: name || candidateSession?.studentName || email || 'Unknown',
          sessionCount: 0, // No sessions in filtered data
          avgFeedback: avgRating,
          feedbackCount: candidateData.count,
          sessionsCancelled: 0,
          sessionsNoShow: 0,
          sessionsRescheduled: 0,
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
        stats.cancelled++;
        break;
      case 'mentor_no_show':
        stats.mentorNoShow++;
        break;
      case 'mentor_rescheduled':
        stats.rescheduled++;
        break;
      case 'pending':
        stats.pending++;
        break;
      case 'student_no_show':
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
          let ratingValue = fb[ratingColumnName] ||
            fb['Rating'] ||
            fb['rating'] ||
            fb['Overall Rating'] ||
            fb['overall rating'] ||
            '';

          // If not found by name, try by column position (H = 8th column, index 7)
          if (!ratingValue || ratingValue === '') {
            const feedbackKeys = Object.keys(fb);
            if (feedbackKeys.length >= 8) {
              ratingValue = fb[feedbackKeys[7]]; // Column H (0-indexed: 7)
            }
          }

          if (!ratingValue || ratingValue === '') return null;
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
          const feedback = s.studentFeedback;
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

    // Only show a rating if the mentor has at least one completed session.
    if (ratings.length > 0 && stats.completed > 0) {
      stats.avgRating =
        Math.round(
          (ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10
        ) / 10;
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
      const isFilledStatus = feedbackStatus === 'filled' || feedbackStatus === 'yes' || feedbackStatus === 'done';

      // If column N indicates filled, it's not "not filled"
      if (isFilledStatus) return false;

      // If column N is not available or indicates not filled, check studentFeedback as fallback
      const hasActualFeedback = s.studentFeedback &&
        String(s.studentFeedback).trim() !== '' &&
        String(s.studentFeedback).trim() !== 'N/A' &&
        String(s.studentFeedback).trim() !== 'null' &&
        String(s.studentFeedback).trim() !== 'undefined';

      return !hasActualFeedback;
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

  const filtered = sessionData.filter((row) => {
    // Check for date in multiple possible fields
    const dateValue = row['Date'] || row['date'] || row['Session Date'] || row['sessionDate'] || row['Zoho Time'] || row['zohoTime'] || '';
    const mentorEmailValue = row['Mentor Email ID'] || row['mentorEmail'] || row['Mentor Email'] || row['mentorEmail'] || '';
    const studentEmailValue = row['Mentee Email'] || row['studentEmail'] || row['Candidate Email'] || row['candidateEmail'] || '';

    // Check if values are non-empty strings (after trimming)
    const hasDate = dateValue && String(dateValue).trim() !== '';
    const hasMentorEmail = mentorEmailValue && String(mentorEmailValue).trim() !== '';
    const hasMenteeEmail = studentEmailValue && String(studentEmailValue).trim() !== '';

    // Require at least one email, and prefer date but allow without date if we have session status
    // This handles cases where Date might be empty but Session Status indicates a valid session
    const hasSessionStatus = row['Session Status'] && String(row['Session Status']).trim() !== '';
    const hasValidSession = hasSessionStatus && (hasMentorEmail || hasMenteeEmail);

    // Valid if: (has date AND has email) OR (has session status AND has email)
    const isValid = (hasDate && (hasMentorEmail || hasMenteeEmail)) || hasValidSession;

    return isValid;
  });

  const parsed = filtered.map((row) => {
    // Get column N (14th column, index 13) for mentor feedback status
    // Try by column name first, then by position
    const allKeys = Object.keys(row);
    let mentorFeedbackStatus = '';
    let sessionType = '';
    let invitationStatus = '';

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

    // Get column R (18th column, index 17) for session type
    // Try by column name first, then by position
    sessionType = row['Session Type'] ||
      row['sessionType'] ||
      row['Type'] ||
      row['type'] ||
      '';

    // If not found by name, try by column position (Column R = index 17)
    if (!sessionType && allKeys.length > 17) {
      sessionType = row[allKeys[17]] || '';
    }

    // Get column J (10th column, index 9) for Invitation Status
    // Try by column name first, then by position
    invitationStatus =
      row['Invitation Status'] ||
      row['Invitation status'] ||
      row['Invitation status '] ||
      row['Invitation status'] ||
      row['invitationStatus'] ||
      row['invitation status'] ||
      row['InvitationStatus'] ||
      '';

    if (!invitationStatus && allKeys.length > 9) {
      invitationStatus = row[allKeys[9]] || '';
    }

    return {
      sNo: row['S No'] || row['sNo'] || null, // Use actual value from sheet, null if missing
      mentorName: row['Mentor Name'] || row['mentorName'] || '',
      mentorEmail: row['Mentor Email ID'] || row['mentorEmail'] || row['Mentor Email'] || '',
      studentName: row['Mentee Name'] || row['studentName'] || row['Candidate Name'] || row['candidateName'] || '',
      studentEmail: row['Mentee Email'] || row['studentEmail'] || row['Candidate Email'] || row['candidateEmail'] || '',
      studentPhone: row['Mentee Ph no'] || row['studentPhone'] || row['Mentee Phone'] || row['studentPhone'] || '',
      date: row['Date'] || row['date'] || row['Zoho Time'] || row['zohoTime'] || row['Session Date'] || row['sessionDate'] || '',
      time: row['Time'] || row['time'] || '',
      inviteTitle: row['Invite Title'] || row['inviteTitle'] || '',
      invitationStatus: String(invitationStatus || '').trim(),
      mentorConfirmationStatus: row['Mentor Confirmation Status'] || row['mentorConfirmationStatus'] || '',
      studentConfirmationStatus: row['Mentee Confirmation Status'] || row['studentConfirmationStatus'] || '',
      sessionStatus: row['Session Status'] || row['sessionStatus'] || '',
      mentorFeedback: '', // Will be merged from feedbacks sheet
      studentFeedback: '', // Will be merged from feedbacks sheet
      mentorFeedbackStatus: String(mentorFeedbackStatus || '').trim(), // Column N from MESA sheet
      sessionType: String(sessionType || '').trim(), // Column R from MESA sheet
      comments: row['Comments'] || row['comments'] || '',
      paymentStatus: row['Payment Status'] || row['paymentStatus'] || '',
      // Prefer explicit Session ID column when present so feedback can be matched 1:1 with sessions
      sessionId:
        row['Session ID'] ||
        row['Session Id'] ||
        row['sessionID'] ||
        row['sessionId'] ||
        row['SessionID'] ||
        '',
    };
  });


  // Only include sessions where Invitation Status (Column J) is "Sent"
  return parsed.filter(s => String(s.invitationStatus || '').trim().toLowerCase() === 'sent');
}

/**
 * Create a unique key for matching sessions with feedbacks
 * Uses: date + mentorEmail + studentEmail as the matching key
 */
function createSessionKey(session: { date: string; mentorEmail: string; studentEmail: string }): string {
  return `${session.date}|${session.mentorEmail}|${session.studentEmail}`.toLowerCase().trim();
}

/**
 * Merge feedback data with session data from two separate feedback sheets
 * - mentorFeedbacks: Feedback from students about mentors (goes into studentFeedback field)
 * - candidateFeedbacks: Feedback from mentors about students (goes into mentorFeedback field)
 * Matches feedbacks to sessions based on date, mentor email, and student email
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
  // Also index candidate feedbacks by explicit Session ID when available
  const candidateFeedbackBySessionId = new Map<string, any>();

  // Process "Mentor Feedback filled by candidates" (student feedback about mentor)
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
      const studentName = feedback['Your Name (Optional)'] || feedback['Your Name'] || feedback['yourName'] || '';

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
  // This sheet contains feedback from mentors about students
  // Column structure: Timestamp, Mentor Name, Candidate Name, Session Date, Case, Difficulty, Rating on scoping questions, Rating on case setup and structure, Rating on quantitative ability (if not tested, rate 1), Rating on communication and confidence, Rating on business acumen and creativity, Overall strength and areas of improvement
  if (Array.isArray(candidateFeedbacks) && candidateFeedbacks.length > 0) {

    candidateFeedbacks.forEach((feedback, index) => {

      // Prefer matching by explicit Session ID when present (column \"Session ID\")
      const rawSessionId =
        feedback['Session ID'] ||
        feedback['Session Id'] ||
        feedback['sessionID'] ||
        feedback['sessionId'] ||
        feedback['SessionID'] ||
        '';
      const normalizedSessionId = rawSessionId ? String(rawSessionId).trim().toLowerCase() : '';
      if (normalizedSessionId) {
        candidateFeedbackBySessionId.set(normalizedSessionId, feedback);
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
    // First, use explicit Session ID if both session and feedbacks provide it.
    let mentorFeedback: any = null;

    const rawSessionId =
      (session as any).sessionId ||
      (session as any)['Session ID'] ||
      (session as any)['Session Id'];
    const normalizedSessionId = rawSessionId ? String(rawSessionId).trim().toLowerCase() : '';

    if (normalizedSessionId) {
      mentorFeedback = candidateFeedbackBySessionId.get(normalizedSessionId) || null;
    }

    // If Session ID match not found, fall back to name/date based strategies

    // Strategy 1: Try with normalized date, mentor name, and mentee name
    if (!mentorFeedback && session.mentorName && session.studentName) {
      const nameKey = `${sessionDateNormalized}|${session.mentorName.trim().toLowerCase()}|${session.studentName.trim().toLowerCase()}`;
      mentorFeedback = candidateFeedbackMap.get(nameKey);
    }

    // Strategy 2: Try with original date format
    if (!mentorFeedback && session.mentorName && session.studentName) {
      const originalDate = session.date.split(' ')[0].split('T')[0];
      const originalNameKey = `${originalDate}|${session.mentorName.trim().toLowerCase()}|${session.studentName.trim().toLowerCase()}`;
      mentorFeedback = candidateFeedbackMap.get(originalNameKey);
    }

    // Strategy 3: Try alternative date formats
    if (!mentorFeedback && session.mentorName && session.studentName) {
      const altDate = sessionDateNormalized.replace(/-/g, '/');
      const altKey = `${altDate}|${session.mentorName.trim().toLowerCase()}|${session.studentName.trim().toLowerCase()}`;
      mentorFeedback = candidateFeedbackMap.get(altKey);
    }

    // Strategy 4: Fallback to email-based matching if names don't work
    if (!mentorFeedback && session.mentorEmail && session.studentEmail) {
      const emailKey = `${sessionDateNormalized}|${session.mentorEmail.trim().toLowerCase()}|${session.studentEmail.trim().toLowerCase()}`;
      mentorFeedback = candidateFeedbackMap.get(emailKey);
    }

    // Try to match mentee feedbacks (mentee feedback about mentor) - multiple strategies
    let studentFeedback = null;

    // Try multiple matching strategies for mentor feedbacks
    const normalizedMentorName = session.mentorName ? String(session.mentorName).trim().toLowerCase() : '';
    const originalDate = String(session.date).split(' ')[0].split('T')[0];

    // Strategy 1: Try with normalized date and mentor name (primary matching)
    if (normalizedMentorName) {
      const nameKey = `${sessionDateNormalized}|${normalizedMentorName}`;
      studentFeedback = mentorFeedbackMap.get(nameKey);
    }

    // Strategy 2: Try with original date format and mentor name
    if (!studentFeedback && normalizedMentorName) {
      const originalNameKey = `${originalDate}|${normalizedMentorName}`;
      studentFeedback = mentorFeedbackMap.get(originalNameKey);
    }

    // Strategy 3: Try with date in MM/DD/YYYY format
    if (!studentFeedback && normalizedMentorName) {
      try {
        const dateObj = new Date(sessionDateNormalized);
        if (!isNaN(dateObj.getTime())) {
          const mmddyyyy = `${dateObj.getMonth() + 1}/${dateObj.getDate()}/${dateObj.getFullYear()}`;
          const mmddyyyyKey = `${mmddyyyy}|${normalizedMentorName}`;
          studentFeedback = mentorFeedbackMap.get(mmddyyyyKey);
        }
      } catch (e) {
        // Ignore
      }
    }

    // Strategy 4: Try alternative date formats with mentor name
    if (!studentFeedback && normalizedMentorName) {
      const altDate = sessionDateNormalized.replace(/-/g, '/');
      const altKey = `${altDate}|${normalizedMentorName}`;
      studentFeedback = mentorFeedbackMap.get(altKey);
    }

    // Strategy 5: Try with mentor email if available
    if (!studentFeedback && session.mentorEmail) {
      const normalizedEmail = String(session.mentorEmail).trim().toLowerCase();
      const emailKey = `${sessionDateNormalized}|${normalizedEmail}`;
      studentFeedback = mentorFeedbackMap.get(emailKey);
    }

    // Strategy 6: Try with original date and mentor email
    if (!studentFeedback && session.mentorEmail) {
      const normalizedEmail = String(session.mentorEmail).trim().toLowerCase();
      const emailKey = `${originalDate}|${normalizedEmail}`;
      studentFeedback = mentorFeedbackMap.get(emailKey);
    }

    // Strategy 7: Try with MM/DD/YYYY date and mentor email
    if (!studentFeedback && session.mentorEmail) {
      try {
        const dateObj = new Date(sessionDateNormalized);
        if (!isNaN(dateObj.getTime())) {
          const mmddyyyy = `${dateObj.getMonth() + 1}/${dateObj.getDate()}/${dateObj.getFullYear()}`;
          const normalizedEmail = String(session.mentorEmail).trim().toLowerCase();
          const emailKey = `${mmddyyyy}|${normalizedEmail}`;
          studentFeedback = mentorFeedbackMap.get(emailKey);
        }
      } catch (e) {
        // Ignore
      }
    }


    let updatedSession = { ...session };

    if (mentorFeedback) {
      // Mentor feedback about mentee - populate mentorFeedback field
      // Use column L "Overall Rating" from "Candidate feedback form filled by mentors" sheet

      let overallRating = mentorFeedback['Overall Rating'] ||
        mentorFeedback['overall rating'] ||
        mentorFeedback['Overall rating'] ||
        mentorFeedback['overallRating'] ||
        null;

      // If not found by column name, try by column position (L = 12th column, index 11)
      if ((!overallRating || overallRating === '' || overallRating === null)) {
        const feedbackKeys = Object.keys(mentorFeedback);
        if (feedbackKeys.length >= 12) {
          overallRating = mentorFeedback[feedbackKeys[11]];
        }
      }

      // Parse and validate the rating
      if (overallRating !== null && overallRating !== undefined && overallRating !== '') {
        const numValue = parseFloat(String(overallRating).replace(/[^0-9.]/g, ''));
        if (!isNaN(numValue) && numValue >= 1 && numValue <= 5) {
          updatedSession.mentorFeedback = numValue.toFixed(2);
        }
      }

      // Also merge comments if available (Overall strength and areas of improvement)
      const commentsValue = mentorFeedback['Overall strength and areas of improvement'] ||
        mentorFeedback['Comments'] || mentorFeedback['comments'] || '';
      if (commentsValue && commentsValue.toString().trim()) {
        updatedSession.comments = commentsValue.toString().trim();
      }
    }

    if (studentFeedback) {
      // Mentee feedback about mentor - populate studentFeedback field
      // Column H contains: "On a scale of 1 to 5 (5 being the best), how would you rate the overall experience of the session?"
      // Try multiple variations of the column name
      const feedbackKeys = Object.keys(studentFeedback);

      // First, try to get by column name (most reliable)
      let ratingValue =
        studentFeedback['On a scale of 1 to 5 (5 being the best), how would you rate the overall experience of the session?'] ||
        studentFeedback['"On a scale of 1 to 5 (5 being the best), how would you rate the overall experience of the session?"'] ||
        studentFeedback['On a scale of 1 to 5'] ||
        studentFeedback['Overall Rating'] ||
        studentFeedback['Rating'] ||
        studentFeedback['rating'] ||
        studentFeedback['Overall Experience Rating'] ||
        studentFeedback['Experience Rating'] ||
        null;

      // If not found by name, try by column position (H = 8th column, index 7)
      if ((!ratingValue || ratingValue === '' || ratingValue === null) && feedbackKeys.length >= 8) {
        ratingValue = studentFeedback[feedbackKeys[7]];
      }

      // Also try other column positions as fallback (scan all columns for numeric ratings)
      if ((!ratingValue || ratingValue === '' || ratingValue === null) && feedbackKeys.length > 0) {
        // Try common positions for rating columns
        for (let i = 0; i < Math.min(feedbackKeys.length, 10); i++) {
          const val = studentFeedback[feedbackKeys[i]];
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
          updatedSession.studentFeedback = numericRating.toString();

        }
      }

      // Store additional feedback details in comments
      const feedbackDetails: string[] = [];

      // Add "Did the mentor join the session on time?"
      const onTime = studentFeedback['Did the mentor join the session on time?'] || '';
      if (onTime && onTime.toString().trim()) {
        feedbackDetails.push(`Joined on time: ${onTime}`);
      }

      // Add facilitation style rating
      const facilitationStyle = studentFeedback['How would you rate the facilitation style of the mentor? (Did the mentor manage time effectively, paced the session well etc.)'] || '';
      if (facilitationStyle && facilitationStyle.toString().trim()) {
        feedbackDetails.push(`Facilitation style: ${facilitationStyle}`);
      }

      // Add quality of feedback rating
      const feedbackQuality = studentFeedback['How would you rate the quality of the feedback provided? (Did the mentor provide specific, actionable feedback?)'] || '';
      if (feedbackQuality && feedbackQuality.toString().trim()) {
        feedbackDetails.push(`Feedback quality: ${feedbackQuality}`);
      }

      // Add suggestions
      const suggestions = studentFeedback['How could it have been made better and any suggestions for the gradnext team or mentor'] || '';
      if (suggestions && suggestions.toString().trim()) {
        feedbackDetails.push(`Suggestions: ${suggestions}`);
      }

      // Merge comments (prefer detailed feedback comments if both exist)
      if (feedbackDetails.length > 0) {
        const existingComments = updatedSession.comments || '';
        updatedSession.comments = feedbackDetails.join(' | ') + (existingComments ? ` | ${existingComments}` : '');
      } else {
        const commentsValue = studentFeedback['Comments'] || studentFeedback['comments'] || '';
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
export function parseStudentData(menteeData: any[]): Student[] {
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
      srNo: parseInt(row['Sr. no.'] || row['Sr. no. '] || row['Sr No'] || row['srNo'] || String(index + 1)) || index + 1,
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
