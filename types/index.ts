// Data types based on spreadsheet structure

export interface Session {
  sNo: number | null; // Can be null if not provided in sheet
  mentorName: string;
  mentorEmail: string;
  studentName: string;
  studentEmail: string;
  studentPhone: string;
  date: string;
  time: string;
  inviteTitle: string;
  invitationStatus: string;
  mentorConfirmationStatus: string;
  studentConfirmationStatus: string;
  sessionStatus: string;
  mentorFeedback: number | string;
  studentFeedback: number | string;
  mentorFeedbackStatus: string; // Column N from MESA sheet - feedback status (Filled/Not Filled)
  sessionType: string; // Column R from MESA sheet - Session Type (Assessment/Practice)
  comments: string;
  paymentStatus: string;
  // Optional unique identifier for the session, coming from "Session ID" column when available
  sessionId?: string;
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

export interface Student {
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
  students: Student[];
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

// Student Dashboard Metrics
export interface StudentMetrics {
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
  candidatesNoSessions: Student[];
  totalSessionsCancelled: number;
  totalSessionsRescheduled: number;
  totalNoShows: number;
  candidatesCancelled: number;
  candidatesRescheduled: number;
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
  sessionsRescheduled: number;
  completedSessions: number;
  firstSessionDate: string;
  lastSessionDate: string;
  uniqueMentors: number;
  totalSessionsBooked: number;
  completionRate: number;
}

