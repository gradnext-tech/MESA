// Data types based on spreadsheet structure

export interface Session {
  sNo: number | null; // Can be null if not provided in sheet
  mentorName: string;
  mentorEmail: string;
  menteeName: string;
  menteeEmail: string;
  menteePhone: string;
  date: string;
  time: string;
  inviteTitle: string;
  invitationStatus: string;
  mentorConfirmationStatus: string;
  menteeConfirmationStatus: string;
  sessionStatus: string;
  mentorFeedback: number | string;
  menteeFeedback: number | string;
  comments: string;
  paymentStatus: string;
}

export interface Mentor {
  srNo: number;
  mentorCode: string;
  name: string;
  confirmation: string;
  inviteSent: string;
  email: string;
  currentCo: string;
  consultingExp: string;
  category: string;
  mbaCollege: string;
  ugCollege: string;
  totalWorkex: string;
  linkedinProfile: string;
}

export interface Mentee {
  srNo: number;
  name: string;
  phoneNumber: string;
  email: string;
  linkedin: string;
  minor1: string;
  minor2: string;
}

export interface SpreadsheetData {
  sessions: Session[];
  mentors: Mentor[];
  mentees: Mentee[];
}

// Mentor Dashboard Metrics
export interface MentorMetrics {
  mentorName: string;
  mentorEmail: string;
  avgRating: number;
  sessionsDone: number;
  sessionsCancelled: number;
  sessionsNoShow: number;
  sessionsRescheduled: number;
  feedbacksFilled: number;
}

// Mentee Dashboard Metrics
export interface MenteeMetrics {
  totalSessionsDone: number;
  avgDailySessions: number;
  candidatesBooking: number;
  firstTimeCandidates: number;
  avgSessionsPerCandidateTotal: number;
  avgSessionsPerCandidateActive: number;
  avgFeedbackScore: number;
  avgSessionsPerWeek: number;
  avgRatingPerWeek: number;
  top10BySessions: CandidateSessionStats[];
  top10ByRating: CandidateSessionStats[];
  bottom10Feedback: CandidateSessionStats[];
  bottom25Feedback: CandidateSessionStats[];
  candidatesNoSessions: Mentee[];
  totalSessionsCancelled: number;
  totalNoShows: number;
  candidatesCancelled: number;
  candidatesNoShow: number;
}

export interface CandidateSessionStats {
  email: string;
  name: string;
  sessionCount: number;
  avgFeedback: number;
  feedbackCount: number;
  sessionsCancelled: number;
  sessionsNoShow: number;
  completedSessions: number;
  firstSessionDate: string;
  lastSessionDate: string;
  uniqueMentors: number;
  totalSessionsBooked: number;
  completionRate: number;
}

