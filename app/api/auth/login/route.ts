import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { fetchMentorCredentials, fetchStudentCredentials } from '@/lib/googleSheets';

// Rate limiting store (in-memory, use Redis in production)
const loginAttempts = new Map<string, { count: number; resetTime: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

// Hash passwords for comparison (move to env in production)
const ADMIN_PASSWORD_HASH = createHash('sha256').update('Gradnext@2026').digest('hex');
const STUDENT_PASSWORD_HASH = createHash('sha256').update('Student@2026').digest('hex');

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
  return ip;
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const attempt = loginAttempts.get(key);

  if (attempt) {
    if (now > attempt.resetTime) {
      // Reset the attempt count
      loginAttempts.delete(key);
      return true;
    }
    if (attempt.count >= MAX_ATTEMPTS) {
      return false; // Rate limited
    }
  }

  return true;
}

function recordAttempt(key: string, success: boolean) {
  const now = Date.now();
  const attempt = loginAttempts.get(key);

  if (success) {
    // Clear attempts on successful login
    loginAttempts.delete(key);
    return;
  }

  if (attempt) {
    attempt.count++;
    if (attempt.count >= MAX_ATTEMPTS) {
      attempt.resetTime = now + LOCKOUT_DURATION;
    }
  } else {
    loginAttempts.set(key, {
      count: 1,
      resetTime: now + LOCKOUT_DURATION,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitKey = getRateLimitKey(request);

    // Check rate limit
    if (!checkRateLimit(rateLimitKey)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      recordAttempt(rateLimitKey, false);
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Hash the provided password
    const passwordHash = createHash('sha256').update(password).digest('hex');

    let accessLevel: 'admin' | 'mesa' | 'mentor' | 'student' | null = null;

    // Check admin credentials
    if (email.trim().endsWith('@gradnext.co') && passwordHash === ADMIN_PASSWORD_HASH) {
      accessLevel = 'admin';
    }
    // Check MESA credentials - only allow learning@mesaschool.co
    else if (email.trim().toLowerCase() === 'learning@mesaschool.co' && passwordHash === STUDENT_PASSWORD_HASH) {
      accessLevel = 'mesa';
    }
    // Check mentor / student credentials from Google Sheets
    else {
      try {
        const feedbacksSpreadsheetId = process.env.GOOGLE_FEEDBACKS_SPREADSHEET_ID;
        if (feedbacksSpreadsheetId) {
          const mentors = await fetchMentorCredentials(feedbacksSpreadsheetId);
          
          // Find mentor by email (case-insensitive)
          const mentor = mentors.find((m: any) => {
            const mentorEmail = (m['Mentor Email'] || m['Email'] || m['email'] || m['Email Address'] || '').trim().toLowerCase();
            return mentorEmail === email.trim().toLowerCase();
          });

          if (mentor) {
            // Check if mentor has a password set
            const storedPasswordHash = (mentor['Password Hash'] || mentor['PasswordHash'] || mentor['password_hash'] || '').trim();
            
            if (storedPasswordHash && storedPasswordHash === passwordHash) {
              accessLevel = 'mentor';
            }
          }

          // If not mentor, try student directory
          if (!accessLevel) {
            const students = await fetchStudentCredentials(feedbacksSpreadsheetId);
            const student = students.find((s: any) => {
              const studentEmail = (s['Email'] || s['email'] || s['Email Address'] || s['email address'] || '').trim().toLowerCase();
              return studentEmail === email.trim().toLowerCase();
            });

            if (student) {
              const storedPasswordHash = (student['Password Hash'] || student['PasswordHash'] || student['password_hash'] || '').trim();
              if (storedPasswordHash && storedPasswordHash === passwordHash) {
                accessLevel = 'student';
              }
            }
          }
        }
      } catch (error) {
        // If there's an error fetching mentor credentials, continue to fail the login
        console.error('Error fetching mentor credentials:', error);
      }
    }

    if (!accessLevel) {
      recordAttempt(rateLimitKey, false);
      // Generic error message to prevent email enumeration
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    recordAttempt(rateLimitKey, true);

    return NextResponse.json({
      success: true,
      email: email.trim(),
      accessLevel,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}
