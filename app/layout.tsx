import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/context/DataContext";
import { AuthProvider } from "@/context/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Performance Dashboard - Mentor & Mentee Analytics",
  description: "Analytics dashboard for mentorship program",
  icons: {
    icon: [
      { url: '/mesadashboard/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/mesadashboard/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/mesadashboard/icon.jpg', sizes: '192x192', type: 'image/jpeg' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" sizes="32x32" href="/mesadashboard/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/mesadashboard/favicon-16.png" />
        <link rel="icon" type="image/jpeg" href="/mesadashboard/icon.jpg" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <DataProvider>
            <DashboardLayout>{children}</DashboardLayout>
          </DataProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
