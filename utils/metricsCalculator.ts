import { Session, MentorMetrics, MenteeMetrics, CandidateSessionStats } from '@/types';
import { parseISO, differenceInDays, startOfWeek, endOfWeek } from 'date-fns';

/**
 * Normalise raw session status text from the spreadsheet
 * Allowed values in the sheet (column M):
 *  - "Completed"
 *  - "Cancelled"
 *  - "Rescheduled"
 *  - "Mentee no show"
 *  - "Mentor No show"
 */
function normalizeSessionStatus(raw?: string) {
  if (!raw) return 'unknown';
  const value = raw.trim().toLowerCase();

  if (value === 'completed') return 'completed';
  if (value === 'cancelled') return 'cancelled';
  if (value === 'rescheduled') return 'rescheduled';

  // Treat both mentee and mentor no shows as no-show for high-level metrics
  if (value === 'mentee no show') return 'mentee_no_show';
  if (value === 'mentor no show') return 'mentor_no_show';

  return 'unknown';
}

/**
 * Calculate Mentor Metrics from session data
 */
export function calculateMentorMetrics(sessions: Session[]): MentorMetrics[] {
  const mentorMap = new Map<string, MentorMetrics>();

  sessions.forEach((session) => {
    const status = normalizeSessionStatus(session.sessionStatus);
    const key = session.mentorEmail;
    
    if (!mentorMap.has(key)) {
      mentorMap.set(key, {
        mentorName: session.mentorName,
        mentorEmail: session.mentorEmail,
        avgRating: 0,
        sessionsDone: 0,
        sessionsCancelled: 0,
        sessionsNoShow: 0,
        sessionsRescheduled: 0,
        feedbacksFilled: 0,
      });
    }

    const metrics = mentorMap.get(key)!;

    // Count sessions done (completed sessions)
    if (status === 'completed') {
      metrics.sessionsDone++;
    }

    // Count cancelled sessions
    if (status === 'cancelled') {
      metrics.sessionsCancelled++;
    }

    // Count no-shows (mentee or mentor)
    if (status === 'mentee_no_show' || status === 'mentor_no_show') {
      metrics.sessionsNoShow++;
    }

    // Count rescheduled
    if (status === 'rescheduled') {
      metrics.sessionsRescheduled++;
    }

    // Count feedbacks filled
    if (session.menteeFeedback && session.menteeFeedback !== '' && session.menteeFeedback !== 'N/A') {
      metrics.feedbacksFilled++;
    }
  });

  // Calculate average ratings
  mentorMap.forEach((metrics, email) => {
    const mentorSessions = sessions.filter(s => s.mentorEmail === email);
    const ratings = mentorSessions
      .map(s => parseFloat(String(s.menteeFeedback)))
      .filter(r => !isNaN(r) && r > 0);
    
    if (ratings.length > 0) {
      metrics.avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    }
  });

  return Array.from(mentorMap.values());
}

/**
 * Calculate Mentee Dashboard Metrics from session data
 */
export function calculateMenteeMetrics(sessions: Session[], weekFilter?: Date): MenteeMetrics {
  let filteredSessions = sessions;

  // Filter by week if provided
  if (weekFilter) {
    const weekStart = startOfWeek(weekFilter, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekFilter, { weekStartsOn: 1 });
    
    filteredSessions = sessions.filter(session => {
      try {
        const sessionDate = parseISO(session.date);
        return sessionDate >= weekStart && sessionDate <= weekEnd;
      } catch {
        return false;
      }
    });
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

  // First time candidates (candidates with only 1 session in the period)
  const firstTimeCandidates = candidateStats.filter(c => c.sessionCount === 1).length;

  // Average sessions per candidate (total)
  const avgSessionsPerCandidateTotal = candidatesBooking > 0 
    ? totalSessionsDone / candidatesBooking 
    : 0;

  // Average sessions per candidate (who have done at least 1 session)
  const activeCandidates = candidateStatsCompleted.filter(c => c.sessionCount >= 1);
  const avgSessionsPerCandidateActive = activeCandidates.length > 0
    ? activeCandidates.reduce((sum, c) => sum + c.sessionCount, 0) / activeCandidates.length
    : 0;

  // Average feedback score (overall)
  const feedbackScores = completedSessions
    .map(s => parseFloat(String(s.menteeFeedback)))
    .filter(f => !isNaN(f) && f > 0);
  const avgFeedbackScore = feedbackScores.length > 0
    ? feedbackScores.reduce((a, b) => a + b, 0) / feedbackScores.length
    : 0;

  // Top percentile feedback scores (based on number of sessions)
  const sortedCandidates = candidateStatsCompleted
    .filter(c => c.feedbackCount > 0)
    .sort((a, b) => b.sessionCount - a.sessionCount);

  const top10Count = Math.ceil(sortedCandidates.length * 0.1);
  const top25Count = Math.ceil(sortedCandidates.length * 0.25);
  const top50Count = Math.ceil(sortedCandidates.length * 0.5);

  const top10PercentFeedback = calculateAvgFeedback(sortedCandidates.slice(0, top10Count));
  const top25PercentFeedback = calculateAvgFeedback(sortedCandidates.slice(0, top25Count));
  const top50PercentFeedback = calculateAvgFeedback(sortedCandidates.slice(0, top50Count));

  // Cancelled and No-shows
  const cancelledSessions = filteredSessions.filter(
    (s) => normalizeSessionStatus(s.sessionStatus) === 'cancelled'
  );
  const noShowSessions = filteredSessions.filter((s) => {
    const status = normalizeSessionStatus(s.sessionStatus);
    return status === 'mentee_no_show' || status === 'mentor_no_show';
  });

  const totalSessionsCancelled = cancelledSessions.length;
  const totalNoShows = noShowSessions.length;

  const candidatesCancelled = new Set(cancelledSessions.map(s => s.menteeEmail)).size;
  const candidatesNoShow = new Set(noShowSessions.map(s => s.menteeEmail)).size;

  return {
    totalSessionsDone,
    avgDailySessions,
    candidatesBooking,
    firstTimeCandidates,
    avgSessionsPerCandidateTotal,
    avgSessionsPerCandidateActive,
    avgFeedbackScore,
    top10PercentFeedback,
    top25PercentFeedback,
    top50PercentFeedback,
    totalSessionsCancelled,
    totalNoShows,
    candidatesCancelled,
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
    } else if (status === 'cancelled') {
      stats.sessionsCancelled++;
    } else if (status === 'mentee_no_show' || status === 'mentor_no_show') {
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
 * Parse spreadsheet data to typed objects
 */
export function parseSpreadsheetData(data: any): Session[] {
  if (!Array.isArray(data)) return [];

  return data.map((row, index) => ({
    sNo: row['S No'] || row['sNo'] || index + 1,
    mentorName: row['Mentor Name'] || row['mentorName'] || '',
    mentorEmail: row['Mentor Email ID'] || row['mentorEmail'] || '',
    menteeName: row['Mentee Name'] || row['menteeName'] || '',
    menteeEmail: row['Mentee Email'] || row['menteeEmail'] || '',
    menteePhone: row['Mentee Ph no'] || row['menteePhone'] || '',
    date: row['Date'] || row['date'] || '',
    time: row['Time'] || row['time'] || '',
    inviteTitle: row['Invite Title'] || row['inviteTitle'] || '',
    invitationStatus: row['Invitation status'] || row['invitationStatus'] || '',
    mentorConfirmationStatus: row['Mentor Confirmation Status'] || row['mentorConfirmationStatus'] || '',
    menteeConfirmationStatus: row['Mentee Confirmation Status'] || row['menteeConfirmationStatus'] || '',
    sessionStatus: row['Session Status'] || row['sessionStatus'] || '',
    mentorFeedback: row['Mentor Feedback'] || row['mentorFeedback'] || '',
    menteeFeedback: row['Mentee Feedback'] || row['menteeFeedback'] || '',
    comments: row['Comments'] || row['comments'] || '',
    paymentStatus: row['Payment Status'] || row['paymentStatus'] || '',
  }));
}

