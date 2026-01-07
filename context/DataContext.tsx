'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Session } from '@/types';

interface DataContextType {
  sessions: Session[];
  setSessions: (sessions: Session[]) => void;
  hasData: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [sessions, setSessions] = useState<Session[]>([]);

  return (
    <DataContext.Provider
      value={{
        sessions,
        setSessions,
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

