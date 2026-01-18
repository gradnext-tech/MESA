'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Session, Student } from '@/types';

interface DataContextType {
  sessions: Session[];
  setSessions: (sessions: Session[]) => void;
  students: Student[];
  setStudents: (students: Student[]) => void;
  candidateFeedbacks: any[];
  setCandidateFeedbacks: (feedbacks: any[]) => void;
  mentorFeedbacks: any[];
  setMentorFeedbacks: (feedbacks: any[]) => void;
  hasData: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [candidateFeedbacks, setCandidateFeedbacks] = useState<any[]>([]);
  const [mentorFeedbacks, setMentorFeedbacks] = useState<any[]>([]);

  return (
    <DataContext.Provider
      value={{
        sessions,
        setSessions,
        students,
        setStudents,
        candidateFeedbacks,
        setCandidateFeedbacks,
        mentorFeedbacks,
        setMentorFeedbacks,
        hasData: sessions.length > 0,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};

