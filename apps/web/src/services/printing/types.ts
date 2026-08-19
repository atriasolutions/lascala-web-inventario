/**
 * Contratos de impresión para L'Scala Web.
 * El Agent vive en loopback; QZ queda como fallback temporal (Fase 5).
 */

export type PrinterStatus =
  | 'idle'
  | 'printing'
  | 'paused'
  | 'offline'
  | 'error'
  | 'unknown';

export type Printer = {
  name: string;
  status: PrinterStatus;
  isDefault: boolean;
  source?: string;
  type?: string;
};

export type PrintJob =
  | {
      kind: 'label';
      name: string;
      code: string;
      copies?: number;
      /** Override; si no, usa preferencia de etiquetas. */
      printer?: string;
    }
  | {
      kind: 'receipt';
      html: string;
      printer?: string;
    };

export type PrintVia = 'agent' | 'qz';

export type PrintResult = {
  ok: boolean;
  via?: PrintVia;
  printer?: string;
  copies?: number;
  reason?: string;
  /** true si Agent falló (p.ej. 501) y se usó QZ. */
  usedFallback?: boolean;
};

export interface PrintService {
  isAgentAvailable(): Promise<boolean>;
  getPrinters(): Promise<Printer[]>;
  print(job: PrintJob): Promise<PrintResult>;
}

export type AgentHealth = {
  ok: boolean;
  name?: string;
  version?: string;
  platform?: string;
  agentId?: string;
};
