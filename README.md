# MESA Dashboard

A modern, sleek analytics dashboard for MESA mentorship program. Track mentor performance and mentee engagement with comprehensive metrics and beautiful visualizations.

## Features

### 🎓 Mentor Dashboard
- **Average Ratings**: See overall mentor performance ratings
- **Sessions Done**: Track completed mentoring sessions
- **Sessions Cancelled/No-Show**: Monitor session disruptions
- **Sessions Rescheduled**: Keep track of schedule changes
- **Feedbacks Filled**: Measure feedback completion rates
- **Individual Mentor Details**: Detailed breakdown for each mentor
- **Visual Analytics**: Interactive charts and graphs

### 👥 Mentee Dashboard
- **Total Sessions Done**: Complete session count
- **Average Daily Sessions**: Daily engagement metrics
- **Candidate Statistics**: Number of candidates booking sessions
- **First-Time Candidates**: Track new candidate acquisition
- **Average Sessions per Candidate**: Engagement depth metrics
- **Feedback Analytics**: Comprehensive feedback scoring
- **Performance Percentiles**: Top 10%, 25%, and 50% analysis
- **Disruption Tracking**: Cancellations and no-shows
- **Key Insights**: Calculated engagement, completion, and retention rates

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Icons**: Lucide React
- **Data Source**: Google Sheets API
- **Date Utilities**: date-fns

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Google Cloud Project with Service Account
- Google Sheets API enabled

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd MESA-Dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Set up Google Sheets Integration:
   - Create a `.env.local` file with your credentials and spreadsheet ID:
   ```env
   GOOGLE_SERVICE_ACCOUNT_CREDENTIALS={"type":"service_account",...}
   GOOGLE_SPREADSHEET_ID=your-spreadsheet-id
   ```
   - See [ENV_SETUP_GUIDE.md](./ENV_SETUP_GUIDE.md) for detailed instructions

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

### Connecting to Google Sheets

1. Configure your `.env.local` file with spreadsheet ID and service account credentials
2. Navigate to the home page
3. Click "Load Data" to connect automatically
4. Your Google Sheet should contain a "Sessions" sheet with the following columns:
   - S No
   - Mentor Name
   - Mentor Email ID
   - Mentee Name
   - Mentee Email
   - Mentee Ph no
   - Date
   - Time
   - Invite Title
   - Invitation status
   - Mentor Confirmation Status
   - Mentee Confirmation Status
   - Session Status
   - Mentor Feedback
   - Mentee Feedback
   - Comments
   - Payment Status

### Sample Data

A sample CSV file is included in `public/sample-data.csv` that you can import into Google Sheets for testing purposes.

### Important Setup Notes

1. **Add both environment variables** to your `.env.local` file:
   - `GOOGLE_SERVICE_ACCOUNT_CREDENTIALS` (service account JSON)
   - `GOOGLE_SPREADSHEET_ID` (your spreadsheet ID)
2. **Share your Google Sheet** with the service account email (found in your service account JSON)
3. Grant **Viewer** access (read-only)

For detailed setup instructions, see [ENV_SETUP_GUIDE.md](./ENV_SETUP_GUIDE.md)

### Navigating Dashboards

- **Home**: Upload data and see quick stats
- **Mentor Dashboard**: View mentor-specific analytics
- **Mentee Dashboard**: Analyze mentee engagement and performance

## Data Format Requirements

### Session Status Values
- `Completed` or `Done` - Successfully completed sessions
- `Cancelled` - Cancelled sessions
- `No-Show` or `NoShow` - Missed sessions
- `Rescheduled` - Rescheduled sessions

### Feedback Scores
- Should be numeric values (typically 1-5 scale)
- Empty or "N/A" values are ignored in calculations

## Key Metrics Explained

### Mentor Metrics
- **Avg. Rating**: Average of all mentee feedback scores for the mentor
- **Sessions Done**: Count of completed sessions
- **Cancelled/No-Show**: Sum of disrupted sessions
- **Rescheduled**: Sessions that were rescheduled
- **Feedbacks Filled**: Number of sessions with mentee feedback

### Mentee Metrics
- **Total Sessions Done**: Count of all completed sessions
- **Avg Daily Sessions**: Total sessions divided by number of unique dates
- **Candidates Booking**: Unique mentees who booked sessions
- **First Time Candidates**: Candidates with only 1 session in the period
- **Avg Sessions per Candidate (Total)**: Average across all candidates
- **Avg Sessions per Candidate (Active)**: Average for candidates with ≥1 session
- **Top Percentile Feedback**: Average feedback for top performers by session count
- **Completion Rate**: Percentage of booked sessions that were completed
- **Disruption Rate**: Percentage of sessions cancelled or no-show

## Project Structure

```
MESA-Dashboard/
├── app/
│   ├── api/
│   │   └── sheets/             # Google Sheets API route
│   ├── layout.tsx              # Root layout with providers
│   ├── page.tsx                # Home page with Google Sheets connect
│   ├── mentor-dashboard/       # Mentor analytics page
│   └── mentee-dashboard/       # Mentee analytics page
├── components/
│   ├── DashboardLayout.tsx        # Main layout with navigation
│   ├── MetricCard.tsx             # Reusable metric card component
│   └── GoogleSheetsAutoConnect.tsx # Google Sheets auto-connection component
├── context/
│   └── DataContext.tsx         # Global state management
├── lib/
│   └── googleSheets.ts         # Google Sheets service
├── types/
│   └── index.ts                # TypeScript type definitions
├── utils/
│   └── metricsCalculator.ts    # Metrics calculation logic
└── public/
    └── sample-data.csv         # Sample data template
```

## Customization

### Colors and Styling
The dashboard uses Tailwind CSS. You can customize colors in `tailwind.config.js` or directly in component classes.

### Metrics
To add or modify metrics, update the calculation logic in `utils/metricsCalculator.ts` and add corresponding UI in the dashboard pages.

### Charts
Charts are built with Recharts. Customize chart configurations in the dashboard page files.

## Development

### Build for Production

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

### Linting

```bash
npm run lint
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - feel free to use this dashboard for your mentorship programs!

## Support

For issues, questions, or suggestions, please open an issue on the repository.

---

Built with ❤️ for MESA Mentorship Program
