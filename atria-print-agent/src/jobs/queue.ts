import crypto from 'node:crypto';
import { logger } from '../logging/logger.js';

/** pending → printing → completed | failed (contrato Fase 4). */
export type JobStatus = 'pending' | 'printing' | 'completed' | 'failed';

export type PrintJobRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  printer?: string;
  jobName?: string;
  format?: string;
  error?: string;
  message?: string;
};

/**
 * Cola serial in-process (paridad labelPrintChain de QZ).
 * Un job a la vez hacia el spooler.
 */
export class JobQueue {
  private readonly jobs = new Map<string, PrintJobRecord>();
  private chain: Promise<void> = Promise.resolve();

  create(meta: {
    printer?: string;
    jobName?: string;
    format?: string;
  }): PrintJobRecord {
    const now = new Date().toISOString();
    const job: PrintJobRecord = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      printer: meta.printer,
      jobName: meta.jobName,
      format: meta.format,
    };
    this.jobs.set(job.id, job);
    logger.info('job.enqueued', { jobId: job.id, printer: job.printer, format: job.format });
    return job;
  }

  /** @deprecated usar create + runSerial */
  enqueue(meta: { printer?: string; jobName?: string; format?: string }): PrintJobRecord {
    return this.create(meta);
  }

  markPrinting(id: string): PrintJobRecord | undefined {
    return this.patch(id, { status: 'printing' });
  }

  markCompleted(id: string): PrintJobRecord | undefined {
    const job = this.patch(id, { status: 'completed', error: undefined, message: undefined });
    if (job) logger.info('job.completed', { jobId: id, printer: job.printer });
    return job;
  }

  markFailed(id: string, error: string, message?: string): PrintJobRecord | undefined {
    const job = this.patch(id, { status: 'failed', error, message });
    if (job) logger.warn('job.failed', { jobId: id, error, message });
    return job;
  }

  get(id: string): PrintJobRecord | undefined {
    return this.jobs.get(id);
  }

  list(): PrintJobRecord[] {
    return [...this.jobs.values()];
  }

  /**
   * Encola trabajo serial. Espera a que termine (éxito o fallo).
   * El caller actualiza completed/failed dentro de `work` o deja que el error propague.
   */
  async runSerial(jobId: string, work: () => Promise<void>): Promise<PrintJobRecord> {
    const run = async () => {
      this.markPrinting(jobId);
      try {
        await work();
        const current = this.get(jobId);
        if (current && current.status === 'printing') {
          this.markCompleted(jobId);
        }
      } catch (err) {
        const current = this.get(jobId);
        if (current && current.status !== 'failed') {
          const code = (err as { code?: string }).code || 'PRINT_FAILED';
          const message = err instanceof Error ? err.message : String(err);
          this.markFailed(jobId, code, message);
        }
        throw err;
      }
    };

    const p = this.chain.then(run, run);
    this.chain = p.then(
      () => undefined,
      () => undefined,
    );
    await p;
    const final = this.get(jobId);
    if (!final) throw new Error(`Job desapareció: ${jobId}`);
    return final;
  }

  private patch(
    id: string,
    patch: Partial<Pick<PrintJobRecord, 'status' | 'error' | 'message'>>,
  ): PrintJobRecord | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    return job;
  }
}

export const jobQueue = new JobQueue();
