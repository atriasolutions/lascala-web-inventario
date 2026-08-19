import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type RunCommandResult = {
  stdout: string;
  stderr: string;
  code: number;
};

export type CommandRunnerOpts = {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  /** Si se define, se escribe a stdin del proceso (p.ej. `lp` con TSPL). */
  stdin?: Buffer | string;
};

export type CommandRunner = (
  file: string,
  args: string[],
  opts?: CommandRunnerOpts,
) => Promise<RunCommandResult>;

/**
 * Ejecuta un binario del SO con timeout y stdin opcional.
 * No lanza si exit ≠0 — el caller decide.
 */
export const defaultCommandRunner: CommandRunner = async (file, args, opts = {}) => {
  const timeoutMs = opts.timeoutMs ?? 8_000;

  if (opts.stdin !== undefined) {
    return runWithStdin(file, args, opts.stdin, {
      env: opts.env,
      timeoutMs,
    });
  }

  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, ...opts.env },
      windowsHide: true,
    });
    return { stdout: stdout ?? '', stderr: stderr ?? '', code: 0 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
    };
    if (e.killed) {
      throw new Error(`Command timed out: ${file} ${args.join(' ')}`);
    }
    const exitCode = typeof e.code === 'number' ? e.code : 1;
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? String(e.message ?? err),
      code: exitCode,
    };
  }
};

function runWithStdin(
  file: string,
  args: string[],
  stdin: Buffer | string,
  opts: { env?: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<RunCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      env: { ...process.env, ...opts.env },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      if (!settled) {
        settled = true;
        reject(new Error(`Command timed out: ${file} ${args.join(' ')}`));
      }
    }, opts.timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({ stdout, stderr, code: code ?? 1 });
      }
    });

    const buf = typeof stdin === 'string' ? Buffer.from(stdin, 'utf8') : stdin;
    child.stdin?.write(buf);
    child.stdin?.end();
  });
}
