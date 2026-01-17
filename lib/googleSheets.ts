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
    console.log(`📊 Sheet "${sheetName}":`, {
      totalRows: rows?.length || 0,
      firstRow: rows?.[0],
      firstRowLength: rows?.[0]?.length,
      secondRow: rows?.[1],
      secondRowLength: rows?.[1]?.length,
      firstFewRows: rows?.slice(0, 4) // Show first 4 rows for debugging
    });
    
    if (!rows || rows.length === 0) {
      console.log(`❌ No rows found in sheet "${sheetName}"`);
      return [];
    }

    // Find the header row - it might not be the first row (could be empty or have "Form_Responses")
    // For "Mentor Feedbacks filled by candidate", headers are in row 2 (index 1)
    let headerRowIndex = -1;
    let actualHeaders: string[] = [];
    
    // Look through the first few rows to find the header row
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i];
      if (row && row.length > 0) {
        // Check if this row looks like headers (has multiple non-empty cells)
        const nonEmptyCells = row.filter((cell: any) => 
          cell !== null && cell !== undefined && String(cell).trim() !== ''
        );
        
        // Skip rows that are just "Form_Responses" or similar metadata
        const rowText = row.map((cell: any) => String(cell || '').toLowerCase()).join(' ');
        const isMetadataRow = rowText.includes('form_responses') || 
                             rowText.includes('responder link') || 
                             rowText.includes('edit link');
        
        // If row has at least 3 non-empty cells and is not a metadata row, it's likely a header row
        if (nonEmptyCells.length >= 3 && !isMetadataRow) {
          headerRowIndex = i;
          actualHeaders = row.map((cell: any) => String(cell || '').trim());
          console.log(`✅ Found headers at row ${i + 1} (index ${i}) for "${sheetName}"`);
          console.log(`Headers:`, actualHeaders.slice(0, 10));
          break;
        }
      }
    }
    
    if (headerRowIndex === -1 || actualHeaders.length === 0) {
      console.log(`❌ No valid headers found in sheet "${sheetName}"`);
      return [];
    }
    
    console.log(`📋 Headers for "${sheetName}":`, {
      count: actualHeaders.length,
      headers: actualHeaders.slice(0, 10),
      columnH: actualHeaders[7] || 'NOT FOUND'
    });
    
    const data: SheetData[] = [];

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
      // Also add column position info for columns with empty headers
      actualHeaders.forEach((header, index) => {
        const cellValue = row[index];
        const stringValue = (cellValue !== undefined && cellValue !== null) ? String(cellValue).trim() : '';
        
        if (header && String(header).trim() !== '') {
          // Add with header name as key
          rowData[String(header)] = stringValue;
        }
        
        // Always add column position info (e.g., _col0, _col1, etc.) for accessing by position
        // This allows us to access column H (index 7) even if header is empty
        rowData[`_col${index}`] = stringValue;
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

    console.log(`✅ Processed "${sheetName}":`, {
      totalRowsProcessed: data.length,
      sampleRow: data[0],
      sampleRowCol7: data[0]?.['_col7']
    });

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
        fetchSheetData(feedbacksSpreadsheetId, 'Mentor Feedbacks filled by candidate').then((data) => {
          console.log('✅ Fetched Mentor Feedbacks sheet:', {
            count: data.length,
            firstRow: data[0],
            firstRowKeys: data[0] ? Object.keys(data[0]) : [],
            sample: data.slice(0, 2)
          });
          return data;
        }).catch((err) => {
          console.error('❌ Error fetching Mentor Feedbacks:', err.message);
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

