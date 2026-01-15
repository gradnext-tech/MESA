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
    console.error('Failed to parse service account credentials:', error);
    console.error('Credentials string length:', credentialsString.length);
    console.error('First 100 characters:', credentialsString.substring(0, 100));
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
      const availableSheets = spreadsheet.data.sheets?.map(s => s.properties?.title).join(', ') || 'none';
      console.error(`❌ Sheet "${sheetName}" not found in spreadsheet. Available sheets: ${availableSheets}`);
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

    // First row is headers
    const headers = rows[0];
    if (!headers || headers.length === 0) {
      return [];
    }
    const data: SheetData[] = [];

    // For Google Forms responses, skip metadata rows (like "Responder Link", "Edit Link")
    // Find the actual header row - it should contain column names like "Mentor Name", "Session Date", etc.
    let headerRowIndex = 0;
    let actualHeaders = headers;
    
    // Check if first row looks like metadata (contains "Responder Link" or "Edit Link" - specific Google Forms metadata)
    if (rows.length > 0 && headers.length > 0) {
      const firstRowKeys = headers.map(h => String(h).toLowerCase());
      // More specific check: look for "responder link" or "edit link" (not just "link" which could be "LinkedIn")
      const hasMetadataKeys = firstRowKeys.some(k => 
        k.includes('responder link') || 
        k.includes('edit link') || 
        (k === 'responder' && firstRowKeys.some(k2 => k2.includes('link')))
      );
      
      if (hasMetadataKeys && rows.length > 1) {
        // The actual headers are likely in the second row
        headerRowIndex = 1;
        actualHeaders = rows[1].map((cell: any) => String(cell || '').trim());
      }
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

    return data;
  } catch (error) {
    console.error('Error fetching sheet data:', error);
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
    let mentees: SheetData[] = [];

    if (feedbacksSpreadsheetId) {
      [mentorFeedbacks, candidateFeedbacks, mentors, mentees] = await Promise.all([
        fetchSheetData(feedbacksSpreadsheetId, 'Mentor Feedbacks filled by candidate').catch((err) => {
          console.error('Error fetching Mentor Feedbacks:', err.message);
          return [];
        }),
        fetchSheetData(feedbacksSpreadsheetId, 'Candidate feedback form filled by mentors').catch((err) => {
          console.error('Error fetching Candidate feedback form filled by mentors:', err.message);
          return [];
        }),
        fetchSheetData(feedbacksSpreadsheetId, 'Mentor directory').catch((err) => {
          console.error('Error fetching Mentor directory:', err.message);
          return [];
        }),
        fetchSheetData(feedbacksSpreadsheetId, 'Mentee Directory').catch((err) => {
          console.error('Error fetching Mentee Directory:', err.message);
          return [];
        }),
      ]);
    }

    return {
      sessions,
      mentorFeedbacks, // Feedback from mentees about mentors
      candidateFeedbacks, // Feedback from mentors about mentees
      mentors,
      mentees,
    };
  } catch (error) {
    console.error('Error fetching sheets:', error);
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
    console.error('Error validating sheets access:', error);
    return false;
  }
}

