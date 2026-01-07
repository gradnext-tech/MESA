# Environment Setup Guide

## Required Environment Variables

Create a `.env.local` file in your project root with these two variables:

```env
# Google Service Account Credentials (JSON as single line)
GOOGLE_SERVICE_ACCOUNT_CREDENTIALS={"type":"service_account","project_id":"your-project",...}

# Google Spreadsheet ID (from your sheet URL)
GOOGLE_SPREADSHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
```

## How to Get These Values

### 1. Service Account Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable Google Sheets API
4. Create a Service Account
5. Generate and download the JSON key file
6. Copy the **entire JSON content** as a single line

### 2. Spreadsheet ID

From your Google Sheets URL:
```
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
                                      ↑ Copy this part
```

Example:
- URL: `https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit`
- ID: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`

## Complete .env.local Example

```env
GOOGLE_SERVICE_ACCOUNT_CREDENTIALS={"type":"service_account","project_id":"mesa-dashboard-123","private_key_id":"abc123","private_key":"-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n","client_email":"mesa-service@mesa-dashboard-123.iam.gserviceaccount.com","client_id":"123456789","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/mesa-service%40mesa-dashboard-123.iam.gserviceaccount.com"}

GOOGLE_SPREADSHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
```

## Important Notes

- ✅ `.env.local` is already in `.gitignore` (won't be committed)
- ✅ Both values are required for the app to work
- ✅ Restart your dev server after creating/updating `.env.local`
- ✅ Share your Google Sheet with the service account email (from the JSON)
- ✅ Service account only needs **Viewer** permission

## Verification

After setting up, test with:

```bash
npm run dev
```

Then open http://localhost:3000 and click "Load Data". You should see your spreadsheet data load successfully.

## Troubleshooting

| Error | Solution |
|-------|----------|
| "not configured" | Check `.env.local` exists and restart server |
| "Failed to fetch" | Share sheet with service account email |
| "No session data" | Verify sheet has "Sessions" tab with data |

---

**Security**: These credentials are server-side only and never exposed to the browser.
