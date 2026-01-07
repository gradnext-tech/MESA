# MESA Dashboard - Quick Start Guide

## 🚀 Get Started in 4 Steps

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Set Up Google Sheets Integration
1. Create a `.env.local` file in the project root
2. Add your Google Service Account credentials:
```env
GOOGLE_SERVICE_ACCOUNT_CREDENTIALS={"type":"service_account",...}
```
3. Share your Google Sheet with the service account email

📖 **Detailed setup guide**: See [GOOGLE_SHEETS_SETUP.md](./GOOGLE_SHEETS_SETUP.md)

### Step 3: Start the Development Server
```bash
npm run dev
```

### Step 4: Open in Browser
Navigate to [http://localhost:3000](http://localhost:3000)

## 📊 Using the Dashboard

### Connecting Your Google Sheet

1. **Prepare Your Google Sheet**
   - Ensure it has a "Sessions" sheet
   - Include all required columns (see Data Format below)
   - Share it with your service account email

2. **Connect**
   - Enter your Google Sheets URL or Spreadsheet ID
   - Click "Connect"
   - Data will be loaded automatically

3. **View Analytics**
   - Navigate to Mentor Dashboard for mentor metrics
   - Navigate to Mentee Dashboard for mentee analytics

### Testing with Sample Data

A sample CSV file is provided at `public/sample-data.csv`. You can:
1. Import it into a Google Sheet
2. Share the sheet with your service account
3. Connect to it from the dashboard

## 📋 Required Data Format

Your Google Sheet must include a "Sessions" sheet with these columns:

| Column Name | Description | Example |
|------------|-------------|---------|
| S No | Serial number | 1 |
| Mentor Name | Full name of mentor | John Smith |
| Mentor Email ID | Mentor's email | john.smith@example.com |
| Mentee Name | Full name of mentee | Alice Johnson |
| Mentee Email | Mentee's email | alice.j@example.com |
| Mentee Ph no | Phone number | +1234567890 |
| Date | Session date | 2024-01-15 |
| Time | Session time | 10:00 AM |
| Invite Title | Session title | Career Guidance |
| Invitation status | Status of invite | Sent |
| Mentor Confirmation Status | Mentor's response | Confirmed |
| Mentee Confirmation Status | Mentee's response | Confirmed |
| Session Status | Final status | Completed |
| Mentor Feedback | Mentor's rating | 4.5 |
| Mentee Feedback | Mentee's rating | 4.8 |
| Comments | Additional notes | Great session |
| Payment Status | Payment status | Paid |

### Important Session Status Values

For accurate metrics, use these values:
- ✅ **Completed** or **Done** - Successfully finished sessions
- ❌ **Cancelled** - Cancelled by either party
- ⚠️ **No-Show**, **NoShow**, or **No show** - Missed sessions
- 🔄 **Rescheduled** - Sessions moved to another time

## 🎯 Dashboard Features

### Mentor Dashboard
- View performance metrics for all mentors
- Search and filter mentors
- Interactive charts showing:
  - Top performing mentors
  - Session status distribution
- Detailed mentor breakdown table

### Mentee Dashboard
- Comprehensive engagement analytics
- Performance percentile analysis
- Visual representations of:
  - Performance metrics
  - Feedback scores
  - Cancellations and no-shows
- Key insights section with calculated rates

## 💡 Tips

1. **Data Quality**: Ensure session statuses are spelled correctly
2. **Feedback Scores**: Use numeric values (1-5 scale recommended)
3. **Real-time Updates**: Data is fetched fresh each time you connect
4. **Auto-Save**: Your spreadsheet ID is saved for quick reconnection
5. **Permissions**: Only Viewer access is needed for the service account

## 🔧 Troubleshooting

### Can't Connect to Google Sheets
- Check that `.env.local` exists with credentials
- Verify the sheet is shared with service account email
- Ensure "Sessions" sheet exists with correct name
- Restart dev server after creating `.env.local`

### Metrics Look Wrong
- Check Session Status spelling and values
- Verify feedback scores are numeric
- Ensure dates are in a recognizable format

### Dashboard is Slow
- Large datasets (1000+ sessions) may take a moment to process
- Google Sheets API has rate limits

## 🎨 UI Features

- **Responsive Design**: Works on desktop, tablet, and mobile
- **Modern Aesthetics**: Gradient backgrounds and smooth animations
- **Interactive Charts**: Hover for detailed information
- **Search & Filter**: Find specific mentors quickly
- **Real-time Updates**: Metrics update immediately after connect
- **Saved Connections**: Automatically remembers your sheet ID

## 📱 Browser Compatibility

Tested and optimized for:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 🔐 Security Notes

- Service account has **read-only** access
- Credentials stored in `.env.local` (not committed to git)
- All data processing happens securely
- No data is stored permanently on the server

## 🆘 Need Help?

1. Check [GOOGLE_SHEETS_SETUP.md](./GOOGLE_SHEETS_SETUP.md) for detailed setup
2. Check the main [README.md](./README.md) for comprehensive documentation
3. Verify your Google Cloud Console settings
4. Check browser console for error messages

---

**Ready to go?** Just run `npm run dev` and start analyzing your mentorship data! 🎉

