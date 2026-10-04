import { open, mkdir, readFile, rename, readdir, unlink } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { canonical, check, ClientError } from './common.js';

export async function privateWrite(path: string, bytes: string | Uint8Array): Promise<void> {
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
}
export class Journal<T extends object> {
  private generation = -1;
  private released = false;
  private constructor(readonly directory: string, readonly lockPath: string) {}
  static async acquire<T extends object>(directory: string): Promise<Journal<T>> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const lockPath = join(directory, 'client.lock');
    try { await privateWrite(lockPath, canonical({ pid: process.pid, hostname: hostname() })); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // Do not automatically steal stale locks: a remote host, PID reuse or an
      // unobserved process can make that unsafe. Document an explicit operator check.
      throw new ClientError('Client journal is locked. Confirm the previous process has stopped before removing client.lock; preserve all other artifacts');
    }
    return new Journal<T>(directory, lockPath);
  }
  async load(): Promise<T | undefined> {
    const names = (await readdir(this.directory)).filter(name => /^state-\d{8}\.json$/.test(name)).sort();
    if (!names.length) return undefined;
    const name = names.at(-1)!;
    this.generation = Number(name.slice(6, 14));
    try { return JSON.parse(await readFile(join(this.directory, name), 'utf8')) as T; }
    catch { throw new ClientError('Saved journal is unreadable; preserve it for reconciliation'); }
  }
  async save(state: T): Promise<void> {
    const sequence = ++this.generation;
    check(sequence < 100_000_000, 'Journal sequence exhausted');
    const destination = join(this.directory, `state-${String(sequence).padStart(8, '0')}.json`);
    const temporary = `${destination}.${process.pid}.tmp`;
    await privateWrite(temporary, canonical(state));
    await rename(temporary, destination);
    // POSIX directory fsync makes the rename durable; Windows does not expose it.
    if (process.platform !== 'win32') {
      const directory = await open(this.directory, 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    }
  }
  async release(): Promise<void> {
    if (!this.released) { await unlink(this.lockPath); this.released = true; }
  }
}
