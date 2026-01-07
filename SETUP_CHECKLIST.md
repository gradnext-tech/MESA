# ✅ MESA Dashboard - Setup Checklist

Quick reference for setting up Google Sheets integration.

## 🔧 Prerequisites

- [ ] Node.js 18+ installed
- [ ] Google Service Account JSON file
- [ ] Google Sheet with mentorship data

## 📝 Setup Steps

### 1️⃣ Install Dependencies
```bash
cd /Users/apoorv/Developer/MESA-Dashboard
npm install
```

### 2️⃣ Configure Environment
```bash
# Create .env.local file
touch .env.local

# Add this line (replace with your actual credentials):
echo 'GOOGLE_SERVICE_ACCOUNT_CREDENTIALS={"type":"service_account",...}' >> .env.local
```

> **Note**: Paste your ENTIRE service account JSON as a single line!

### 3️⃣ Share Google Sheet
1. Open your Google Sheet
2. Click "Share"
3. Add service account email (from JSON file: `client_email`)
4. Set permission to "Viewer"
5. Uncheck "Notify people"
6. Click "Share"

### 4️⃣ Verify Sheet Structure
Check your Google Sheet has:
- [ ] A sheet named **"Sessions"** (exact name)
- [ ] All required columns (see below)
- [ ] At least one row of data

### 5️⃣ Start Server
```bash
npm run dev
```

### 6️⃣ Connect Dashboard
1. Open: http://localhost:3000
2. Paste Google Sheets URL
3. Click "Connect"
4. ✨ Done!

## 📊 Required Columns in "Sessions" Sheet

```
S No | Mentor Name | Mentor Email ID | Mentee Name | Mentee Email | 
Mentee Ph no | Date | Time | Invite Title | Invitation status | 
Mentor Confirmation Status | Mentee Confirmation Status | Session Status | 
Mentor Feedback | Mentee Feedback | Comments | Payment Status
```

## 🔍 Quick Verification

```bash
# 1. Check .env.local exists
ls -la .env.local

# 2. Check credentials are set (shows length, not content)
cat .env.local | wc -c

# 3. Start dev server
npm run dev

# 4. Test in browser
open http://localhost:3000
```

## 🐛 Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| "credentials not configured" | Create `.env.local` and restart server |
| "Failed to fetch data" | Share sheet with service account |
| "No session data found" | Check sheet name is "Sessions" |
| Server won't start | Run `npm install` again |

## 📱 Where to Find Things

| What | Where |
|------|-------|
| Service account email | In JSON file: `client_email` field |
| Spreadsheet ID | In URL: `/d/SPREADSHEET_ID/edit` |
| Your sheet URL | Browser address bar when sheet is open |
| Error messages | Browser console (F12 → Console) |

## 💾 Files You Need

✅ **You have these (created):**
- `/Users/apoorv/Developer/MESA-Dashboard/` (project)
- `package.json` (dependencies)
- `app/`, `components/`, `lib/` folders (code)

🔴 **You need to create:**
- `.env.local` (with service account credentials)

## 🎯 Success Criteria

You'll know it's working when:
- ✅ Server starts without errors
- ✅ Dashboard loads at localhost:3000
- ✅ "Connect" button doesn't show error
- ✅ Session count shows in success message
- ✅ Can navigate to Mentor/Mentee dashboards
- ✅ Charts and metrics display correctly

## 🚀 Next Actions After Setup

1. **Test with sample data**: Use `public/sample-data.csv`
2. **Add real data**: Connect to your actual sheet
3. **Explore dashboards**: Check Mentor & Mentee analytics
4. **Share with team**: Deploy or share localhost

## 📚 Full Documentation

- `GOOGLE_SHEETS_SETUP.md` - Complete setup guide
- `GOOGLE_SHEETS_MIGRATION_SUMMARY.md` - What changed
- `QUICKSTART.md` - Quick start guide
- `README.md` - Full documentation
- `IMPLEMENTATION_NOTES.md` - Technical details

## 🆘 Still Need Help?

1. Read `GOOGLE_SHEETS_SETUP.md` (most comprehensive)
2. Check browser console for errors (F12)
3. Verify service account email is in sheet permissions
4. Ensure `.env.local` has valid JSON (no line breaks)
5. Restart dev server after changing `.env.local`

---

**Print this and check off items as you go!** ✅

Last updated: January 2026

