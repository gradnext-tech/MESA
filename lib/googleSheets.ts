import { google } from 'googleapis';

interface SheetData {
  [key: string]: any;
}

/**
 * Initialize Google Sheets API client with service account credentials
 */
function getGoogleSheetsClient() {
  // Parse the service account credentials from environment variable
  const credentialsString = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  
  if (!credentialsString) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS environment variable not found');
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsString);
  } catch (error) {
    throw new Error('Invalid JSON in GOOGLE_SERVICE_ACCOUNT_CREDENTIALS. Make sure it\'s a valid JSON string on a single line.');
  }

  if (!credentials.type || credentials.type !== 'service_account') {
    throw new Error('Invalid service account credentials format');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Fetch data from a specific sheet in a Google Spreadsheet
 */
export async function fetchSheetData(
  spreadsheetId: string,
  sheetName: string
): Promise<SheetData[]> {
  try {
    const sheets = getGoogleSheetsClient();

    // First, get the list of sheets to find the exact sheet name (handles case sensitivity and exact matching)
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheet = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title?.toLowerCase() === sheetName.toLowerCase()
    );

    if (!sheet || !sheet.properties?.title) {
      return [];
    }
    
    // Use the exact sheet name from the spreadsheet (preserves case and any special characters)
    const exactSheetName = sheet.properties.title;
    
    // Google Sheets API: sheet names with spaces need to be wrapped in single quotes
    // Escape single quotes in the sheet name by doubling them
    // Use A:ZZ to cover more columns (up to column ZZ)
    let range: string;
    if (exactSheetName.includes(' ') || exactSheetName.includes("'") || exactSheetName.includes('!')) {
      // Escape single quotes by doubling them, then wrap in single quotes
      const escapedName = exactSheetName.replace(/'/g, "''");
      range = `'${escapedName}'!A:ZZ`;
    } else {
      range = `${exactSheetName}!A:ZZ`;
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return [];
    }

    // For Google Forms responses, headers are in row 2, not row 1
    // Row 1 typically contains form metadata
    const data: SheetData[] = [];
    
    let headerRowIndex = 0;
    let actualHeaders = rows[0];
    
    // Check if this is a Google Form sheet by sheet name or by checking for metadata in row 1
    const isFormSheet = sheetName.toLowerCase().includes('feedback') || 
                       sheetName.toLowerCase().includes('form') ||
                       sheetName.toLowerCase().includes('response');
    
    if (rows.length > 1) {
      const firstRowKeys = rows[0].map(h => String(h || '').toLowerCase());
      
      // Check if first row looks like metadata (contains "Responder Link", "Edit Link", or other form metadata)
      const hasMetadataKeys = firstRowKeys.some(k => 
        k.includes('responder link') || 
        k.includes('edit link') ||
        k.includes('responder') ||
        k.includes('edit') ||
        (k === 'responder' && firstRowKeys.some(k2 => k2.includes('link')))
      );
      
      // For form sheets OR if metadata detected, use row 2 as headers
      if ((isFormSheet || hasMetadataKeys) && rows.length > 1) {
        headerRowIndex = 1;
        actualHeaders = rows[1].map((cell: any) => String(cell || '').trim());
      } else {
        // Otherwise use row 1 as headers
        actualHeaders = rows[0].map((cell: any) => String(cell || '').trim());
      }
    } else if (rows.length > 0) {
      // Only one row, use it as headers
      actualHeaders = rows[0].map((cell: any) => String(cell || '').trim());
    } else {
      // No rows at all
      return [];
    }
    
    // Validate headers
    if (!actualHeaders || actualHeaders.length === 0 || actualHeaders.every(h => !h || h.trim() === '')) {
      return [];
    }

    // Convert rows to objects using headers as keys
    // Start from after the header row
    const dataStartIndex = headerRowIndex + 1;
    
    for (let i = dataStartIndex; i < rows.length; i++) {
      const row = rows[i];
      
      // Skip completely empty rows
      if (!row || row.length === 0 || row.every((cell: any) => {
        if (cell === undefined || cell === null) return true;
        if (typeof cell === 'string' && cell.trim() === '') return true;
        return false;
      })) {
        continue;
      }
      
      // Create a fresh object for each row to avoid reference issues
      const rowData: SheetData = {};

      // Map each header to its corresponding cell value
      actualHeaders.forEach((header, index) => {
        if (header && String(header).trim() !== '') {
          // Get the actual cell value for this row
          const cellValue = row[index];
          
          // Convert to string and trim, or use empty string if null/undefined
          if (cellValue !== undefined && cellValue !== null) {
            const stringValue = String(cellValue).trim();
            rowData[String(header)] = stringValue;
          } else {
            rowData[String(header)] = '';
          }
        }
      });

      // Only add row if it has at least one non-empty value
      const hasData = Object.values(rowData).some(value => {
        if (typeof value === 'string') {
          return value.trim() !== '';
        }
        return value !== null && value !== undefined && value !== '';
      });
      
      if (hasData) {
        data.push(rowData);
      }
    }

    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Fetch all required sheets from two different spreadsheets
 * @param sessionsSpreadsheetId - Spreadsheet ID for sessions (contains "Mesa tracker" sheet)
 * @param feedbacksSpreadsheetId - Spreadsheet ID for feedbacks (contains feedback sheets)
 */
export async function fetchAllSheets(
  sessionsSpreadsheetId: string,
  feedbacksSpreadsheetId?: string
) {
  try {
    // Fetch session data from first spreadsheet
    const sessions = await fetchSheetData(sessionsSpreadsheetId, 'Mesa tracker');

    // Fetch feedback data and directories from second spreadsheet if provided
    let mentorFeedbacks: SheetData[] = [];
    let candidateFeedbacks: SheetData[] = [];
    let mentors: SheetData[] = [];
    let students: SheetData[] = [];

    if (feedbacksSpreadsheetId) {
      [mentorFeedbacks, candidateFeedbacks, mentors, students] = await Promise.all([
        fetchSheetData(feedbacksSpreadsheetId, 'Mentor Feedbacks filled by candidate').catch(() => []),
        fetchSheetData(feedbacksSpreadsheetId, 'Candidate feedback form filled by mentors').catch(() => []),
        fetchSheetData(feedbacksSpreadsheetId, 'Mentor directory').catch(() => []),
        fetchSheetData(feedbacksSpreadsheetId, 'Mentee Directory').catch(() => []),
      ]);
    }

    return {
      sessions,
      mentorFeedbacks, // Feedback from students about mentors
      candidateFeedbacks, // Feedback from mentors about students
      mentors,
      students,
      mentees: students, // Backward compatibility alias
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Fetch mentor credentials from Mentor directory sheet
 * @param feedbacksSpreadsheetId - Spreadsheet ID for feedbacks (contains "Mentor directory" sheet)
 */
export async function fetchMentorCredentials(feedbacksSpreadsheetId: string) {
  try {
    const mentors = await fetchSheetData(feedbacksSpreadsheetId, 'Mentor directory');
    return mentors;
  } catch (error) {
    throw error;
  }
}

/**
 * Fetch student credentials from Mentee Directory sheet
 * @param feedbacksSpreadsheetId - Spreadsheet ID for feedbacks (contains "Mentee Directory" sheet)
 */
export async function fetchStudentCredentials(feedbacksSpreadsheetId: string) {
  try {
    const students = await fetchSheetData(feedbacksSpreadsheetId, 'Mentee Directory');
    return students;
  } catch (error) {
    throw error;
  }
}

/**
 * Validate Google Sheets connection
 */
export async function validateSheetsAccess(spreadsheetId: string): Promise<boolean> {
  try {
    const sheets = getGoogleSheetsClient();
    
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    return !!response.data;
  } catch (error) {
    return false;
  }
}

