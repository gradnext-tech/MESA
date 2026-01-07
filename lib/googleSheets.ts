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

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:Z`, // Adjust range as needed
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return [];
    }

    // First row is headers
    const headers = rows[0];
    const data: SheetData[] = [];

    // Convert rows to objects using headers as keys
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowData: SheetData = {};

      headers.forEach((header, index) => {
        rowData[header] = row[index] || '';
      });

      data.push(rowData);
    }

    return data;
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    throw error;
  }
}

/**
 * Fetch all required sheets (Sessions, Mentor Directory, Mentee Directory)
 */
export async function fetchAllSheets(spreadsheetId: string) {
  try {
    const [sessions, mentors, mentees] = await Promise.all([
      fetchSheetData(spreadsheetId, 'Sessions'),
      fetchSheetData(spreadsheetId, 'Mentor Directory').catch(() => []),
      fetchSheetData(spreadsheetId, 'Mentee Directory').catch(() => []),
    ]);

    return {
      sessions,
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

