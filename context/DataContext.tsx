'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Session, Mentee } from '@/types';

interface DataContextType {
  sessions: Session[];
  setSessions: (sessions: Session[]) => void;
  mentees: Mentee[];
  setMentees: (mentees: Mentee[]) => void;
  hasData: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [mentees, setMentees] = useState<Mentee[]>([]);

  return (
    <DataContext.Provider
      value={{
        sessions,
        setSessions,
        mentees,
        setMentees,
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

