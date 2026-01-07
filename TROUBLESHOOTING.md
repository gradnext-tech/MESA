# Troubleshooting Guide

## Common Issues and Solutions

### 1. JSON Parse Error in Service Account Credentials

**Error:**
```
SyntaxError: Expected property name or '}' in JSON at position 1
```

**Cause:** The `GOOGLE_SERVICE_ACCOUNT_CREDENTIALS` in your `.env.local` file is not valid JSON.

**Solutions:**

#### Option A: Check Your .env.local Format
Your `.env.local` should look like this (all on ONE line):
```env
GOOGLE_SERVICE_ACCOUNT_CREDENTIALS={"type":"service_account","project_id":"your-project",...}
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id
```

#### Option B: Common Formatting Issues

1. **No line breaks in the JSON:**
   ```env
   # ❌ WRONG - has line breaks
   GOOGLE_SERVICE_ACCOUNT_CREDENTIALS={
     "type": "service_account",
     "project_id": "your-project"
   }
   
   # ✅ CORRECT - single line
   GOOGLE_SERVICE_ACCOUNT_CREDENTIALS={"type":"service_account","project_id":"your-project",...}
   ```

2. **No quotes around the variable name:**
   ```env
   # ❌ WRONG - has quotes around variable name
   "GOOGLE_SERVICE_ACCOUNT_CREDENTIALS"={"type":"service_account",...}
   
   # ✅ CORRECT - no quotes around variable name
   GOOGLE_SERVICE_ACCOUNT_CREDENTIALS={"type":"service_account",...}
   ```

3. **No extra spaces:**
   ```env
   # ❌ WRONG - space before =
   GOOGLE_SERVICE_ACCOUNT_CREDENTIALS ={"type":"service_account",...}
   
   # ✅ CORRECT - no spaces
   GOOGLE_SERVICE_ACCOUNT_CREDENTIALS={"type":"service_account",...}
   ```

#### Option C: Validate Your JSON

1. Copy your service account JSON from Google Cloud
2. Use an online JSON validator (like jsonlint.com)
3. Make sure it's valid JSON
4. Copy the entire JSON as one line into your `.env.local`

#### Option D: Step-by-Step Fix

1. **Delete your current `.env.local` file:**
   ```bash
   rm .env.local
   ```

2. **Create a new one:**
   ```bash
   touch .env.local
   ```

3. **Open it in a text editor and add:**
   ```env
   GOOGLE_SERVICE_ACCOUNT_CREDENTIALS=PASTE_YOUR_JSON_HERE
   GOOGLE_SPREADSHEET_ID=your-spreadsheet-id
   ```

4. **Replace `PASTE_YOUR_JSON_HERE` with your actual service account JSON (as one line)**

5. **Restart your dev server:**
   ```bash
   npm run dev
   ```

### 2. Environment Variables Not Loading

**Error:**
```
GOOGLE_SERVICE_ACCOUNT_CREDENTIALS environment variable not found
```

**Solutions:**

1. **Make sure `.env.local` exists in the project root:**
   ```bash
   ls -la .env.local
   ```

2. **Restart your development server:**
   ```bash
   # Stop the server (Ctrl+C)
   npm run dev
   ```

3. **Check file location:**
   ```
   /Users/apoorv/Developer/MESA-Dashboard/.env.local  ✅ Correct
   /Users/apoorv/Developer/MESA-Dashboard/app/.env.local  ❌ Wrong location
   ```

### 3. Spreadsheet Access Issues

**Error:**
```
Failed to fetch data from Google Sheets
```

**Solutions:**

1. **Share your Google Sheet with the service account:**
   - Open your Google Sheet
   - Click "Share"
   - Add the `client_email` from your service account JSON
   - Give it "Viewer" permission
   - Uncheck "Notify people"

2. **Check your spreadsheet ID:**
   - Make sure `GOOGLE_SPREADSHEET_ID` in `.env.local` matches your sheet
   - Extract from URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`

3. **Verify sheet structure:**
   - Make sure you have a sheet named exactly "Sessions"
   - Check that it has the required columns

### 4. API Quota Exceeded

**Error:**
```
Quota exceeded for quota metric 'Read requests'
```

**Solutions:**

1. **Wait and retry** (quotas reset every 100 seconds)
2. **Reduce connection frequency**
3. **Check Google Cloud Console** for quota usage

### 5. Development Server Issues

**Error:**
```
Module not found or compilation errors
```

**Solutions:**

1. **Clear Next.js cache:**
   ```bash
   rm -rf .next
   npm run dev
   ```

2. **Reinstall dependencies:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Check Node.js version:**
   ```bash
   node --version  # Should be 18+
   ```

## Debugging Steps

### 1. Check Environment Variables

Create a test file to verify your environment:

```javascript
// test-env.js
console.log('Credentials exist:', !!process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
console.log('Credentials length:', process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS?.length);
console.log('Spreadsheet ID:', process.env.GOOGLE_SPREADSHEET_ID);

// Test JSON parsing
try {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS || '{}');
  console.log('JSON is valid, project:', creds.project_id);
} catch (e) {
  console.log('JSON parse error:', e.message);
}
```

Run with: `node -r dotenv/config test-env.js`

### 2. Check Google Cloud Setup

1. **Verify API is enabled:**
   - Go to Google Cloud Console
   - APIs & Services → Library
   - Search "Google Sheets API"
   - Make sure it's enabled

2. **Check service account:**
   - IAM & Admin → Service Accounts
   - Find your service account
   - Make sure it exists and has a key

### 3. Test Sheet Access

Try accessing your sheet manually:
1. Open the sheet URL in a browser
2. Make sure you can view it
3. Check that the service account email is in the sharing list

## Getting Help

If you're still stuck:

1. **Check the browser console** (F12 → Console) for client-side errors
2. **Check the terminal** for server-side errors
3. **Verify all environment variables** are set correctly
4. **Test with a simple sheet** first before using complex data

## Quick Verification Checklist

- [ ] `.env.local` exists in project root
- [ ] Service account JSON is valid and on one line
- [ ] Spreadsheet ID is correct
- [ ] Google Sheet is shared with service account email
- [ ] Sheet has "Sessions" tab with required columns
- [ ] Development server restarted after env changes
- [ ] Google Sheets API is enabled in Google Cloud Console

---

**Still having issues?** The error logs will give you specific clues about what's wrong. Check both the browser console and terminal output.
