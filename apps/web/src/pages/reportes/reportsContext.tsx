import { createContext, useContext, type ReactNode } from 'react';
import type { ReportsPeriodState, ReportsVista } from './reportsPeriod';

export type ReportsFiltersValue = {
  vista: ReportsVista;
  branchId: string | null;
  branchName: string;
  period: ReportsPeriodState;
  from: string;
  to: string;
};

const ReportsFiltersContext = createContext<ReportsFiltersValue | null>(null);

export function ReportsFiltersProvider({
  value,
  children,
}: {
  value: ReportsFiltersValue;
  children: ReactNode;
}) {
  return <ReportsFiltersContext.Provider value={value}>{children}</ReportsFiltersContext.Provider>;
}

export function useReportsFilters(): ReportsFiltersValue {
  const ctx = useContext(ReportsFiltersContext);
  if (!ctx) {
    throw new Error('useReportsFilters requiere ReportsLayout');
  }
  return ctx;
}
