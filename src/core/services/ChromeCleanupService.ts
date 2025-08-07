import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { LoggerService } from './LoggerService';
import { SupabaseService } from './SupabaseService';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export class ChromeCleanupService extends EventEmitter {
  private static instance: ChromeCleanupService;
  private logger: LoggerService;
  private isCleaningUp = false;
  private lastCleanupTime = 0;
  private MIN_CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes minimum between cleanups
  private activeSessions = new Map<string, number>(); // userId -> pid mapping
  private db: SupabaseService;

  private constructor() {
    super();
    this.logger = LoggerService.getInstance();
    this.db = SupabaseService.getInstance();
    // DO NOT auto-start cleanup - let it be triggered manually
    // this.setupCleanupInterval();
  }

  public static getInstance(): ChromeCleanupService {
    if (!ChromeCleanupService.instance) {
      ChromeCleanupService.instance = new ChromeCleanupService();
    }
    return ChromeCleanupService.instance;
  }

  /**
   * Register an active session to protect from cleanup
   */
  public registerActiveSession(userId: string, pid: number): void {
    this.activeSessions.set(userId, pid);
    this.logger.debug('Registered active session', { userId, pid });
  }

  /**
   * Unregister a session when it's disconnected
   */
  public unregisterSession(userId: string): void {
    this.activeSessions.delete(userId);
    this.logger.debug('Unregistered session', { userId });
  }

  /**
   * Clean up ONLY truly zombie Chrome processes
   * This is much more conservative to avoid killing active sessions
   */
  public async cleanupZombieProcesses(): Promise<number> {
    // Prevent too frequent cleanups
    const now = Date.now();
    if (now - this.lastCleanupTime < this.MIN_CLEANUP_INTERVAL) {
      this.logger.debug('Skipping cleanup - too soon after last cleanup', {
        timeSinceLastCleanup: now - this.lastCleanupTime,
        minInterval: this.MIN_CLEANUP_INTERVAL
      });
      return 0;
    }

    if (this.isCleaningUp) {
      this.logger.debug('Cleanup already in progress, skipping');
      return 0;
    }

    this.isCleaningUp = true;
    this.lastCleanupTime = now;
    let killedCount = 0;

    try {
      // Get list of active PIDs to protect
      const protectedPids = new Set(this.activeSessions.values());
      
      // Also get PIDs from database (active workers)
      const dbProtectedPids = await this.getActiveWorkerPidsFromDB();
      dbProtectedPids.forEach(pid => protectedPids.add(pid));
      
      this.logger.info('Protected PIDs from active sessions', { 
        count: protectedPids.size,
        pids: Array.from(protectedPids)
      });

      // Find all Chrome/Chromium processes
      const { stdout: processListRaw } = await execAsync(
        "ps aux | grep -E '(chrome|chromium)' | grep -v grep"
      ).catch(() => ({ stdout: '' }));

      if (!processListRaw.trim()) {
        this.logger.debug('No Chrome processes found');
        return 0;
      }

      const processList = processListRaw.trim().split('\n');
      this.logger.info(`Found ${processList.length} Chrome processes, checking for TRUE zombies`);

      for (const processLine of processList) {
        const parts = processLine.split(/\s+/);
        const pid = parseInt(parts[1]);
        
        if (isNaN(pid)) continue;

        // NEVER kill protected PIDs
        if (protectedPids.has(pid)) {
          this.logger.debug(`Skipping protected PID ${pid}`);
          continue;
        }

        try {
          // Get detailed process info
          const { stdout: processInfo } = await execAsync(
            `ps -p ${pid} -o ppid=,state=,etime=,cmd= | head -1`
          ).catch(() => ({ stdout: '' }));

          if (!processInfo.trim()) continue;

          const infoMatch = processInfo.match(/^\s*(\d+)\s+([A-Z])\s+([\d:-]+)\s+(.+)$/);
          if (!infoMatch) continue;

          const ppid = parseInt(infoMatch[1]);
          const state = infoMatch[2];
          const elapsed = infoMatch[3];
          const cmd = infoMatch[4];

          // Check if parent process is also protected
          if (protectedPids.has(ppid)) {
            this.logger.debug(`Skipping PID ${pid} - parent ${ppid} is protected`);
            continue;
          }

          // Parse elapsed time (format: [[dd-]hh:]mm:ss)
          const elapsedMinutes = this.parseElapsedTime(elapsed);

          // ONLY kill if ALL of these conditions are met:
          const shouldKill = (
            state === 'Z' || // Zombie/defunct process
            // (state === 'T' && elapsedMinutes > 60) || // REMOVED: Don't kill stopped processes - they might resume
            (ppid === 1 && cmd.includes('--crashed')) || // Crashed and orphaned
            (ppid === 1 && elapsedMinutes > 360 && !cmd.includes('--type=gpu')) // Orphaned for over 6 hours (not GPU process)
          );

          if (shouldKill) {
            try {
              await execAsync(`kill -9 ${pid}`);
              killedCount++;
              this.logger.info(`Killed zombie Chrome process`, { 
                pid, 
                ppid, 
                state,
                elapsed,
                reason: state === 'Z' ? 'zombie' : state === 'T' ? 'stopped' : 'orphaned'
              });
            } catch (killError) {
              this.logger.debug(`Failed to kill PID ${pid}, may have already exited`);
            }
          }
        } catch (error) {
          // Process might have already exited
          continue;
        }
      }

      if (killedCount > 0) {
        this.logger.info(`Chrome cleanup completed, killed ${killedCount} TRUE zombie processes`);
        this.emit('cleanup:completed', { killedCount });
      } else {
        this.logger.debug('No zombie processes found to clean');
      }

      return killedCount;

    } catch (error) {
      this.logger.error('Error during Chrome cleanup', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    } finally {
      this.isCleaningUp = false;
    }
  }

  /**
   * Parse elapsed time string to minutes
   */
  private parseElapsedTime(elapsed: string): number {
    try {
      // Format can be: mm:ss, hh:mm:ss, or dd-hh:mm:ss
      const parts = elapsed.split(/[-:]/);
      if (parts.length === 2) {
        // mm:ss
        return parseInt(parts[0]) + parseInt(parts[1]) / 60;
      } else if (parts.length === 3) {
        // hh:mm:ss
        return parseInt(parts[0]) * 60 + parseInt(parts[1]) + parseInt(parts[2]) / 60;
      } else if (parts.length === 4) {
        // dd-hh:mm:ss
        return parseInt(parts[0]) * 24 * 60 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
      }
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get active worker PIDs from database
   */
  private async getActiveWorkerPidsFromDB(): Promise<number[]> {
    try {
      const { data: users, error } = await this.db
        .from('users')
        .select('worker_pid')
        .not('worker_pid', 'is', null);

      if (error || !users) {
        return [];
      }

      return users
        .map(u => u.worker_pid)
        .filter(pid => pid && !isNaN(pid));
    } catch (error) {
      this.logger.error('Error getting active worker PIDs from DB', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Clean up WhatsApp Web cache (conservative)
   */
  private async cleanupCache(): Promise<void> {
    try {
      const { stdout: cacheSize } = await execAsync(
        'du -sh .wwebjs_cache 2>/dev/null || echo "0"'
      ).catch(() => ({ stdout: '0' }));

      const size = cacheSize.trim();
      if (size !== '0' && !size.startsWith('0')) {
        this.logger.info(`WhatsApp cache size: ${size}`);
        
        // Only remove cache files older than 7 days (not 1 day)
        await execAsync(
          'find .wwebjs_cache -type f -mtime +7 -delete 2>/dev/null'
        ).catch(() => {});
        
        this.logger.debug('Cleaned old cache files (>7 days)');
      }
    } catch (error) {
      this.logger.debug('Cache cleanup skipped', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Force kill all Chrome processes (emergency use only!)
   */
  public async forceKillAllChrome(): Promise<void> {
    this.logger.warn('EMERGENCY: Force killing ALL Chrome processes');
    
    try {
      // Clear all protected sessions first
      this.activeSessions.clear();
      
      await execAsync('pkill -9 -f chrome || true');
      await execAsync('pkill -9 -f chromium || true');
      
      // Clean up shared memory
      await execAsync('rm -rf /dev/shm/.org.chromium.* 2>/dev/null || true');
      
      this.logger.info('Force kill completed - ALL Chrome processes terminated');
      this.emit('cleanup:forced');
    } catch (error) {
      this.logger.error('Error during force kill', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Clean up specific user session (when user explicitly disconnects)
   */
  public async cleanupUserSession(userId: string): Promise<void> {
    try {
      this.logger.info('Cleaning up user session on disconnect', { userId });
      
      // Unregister the session first
      this.unregisterSession(userId);
      
      // Kill Chrome processes for specific user (more targeted)
      const { stdout: userPids } = await execAsync(
        `ps aux | grep -E "(chrome|chromium).*${userId}" | grep -v grep | awk '{print $2}'`
      ).catch(() => ({ stdout: '' }));

      if (userPids.trim()) {
        const pids = userPids.trim().split('\n');
        for (const pid of pids) {
          if (pid.trim()) {
            await execAsync(`kill -9 ${pid}`).catch(() => {});
          }
        }
        this.logger.info(`Killed ${pids.length} Chrome processes for user`, { userId });
      }

      // Clean user's WhatsApp session directory
      const sessionPath = path.join('data_v2', userId, '.wwebjs_auth');
      if (fs.existsSync(sessionPath)) {
        await execAsync(`rm -rf "${sessionPath}"`).catch(() => {});
        this.logger.info('Removed user session directory', { userId, sessionPath });
      }
      
      // Clean user's cache
      await execAsync(`rm -rf .wwebjs_cache/${userId}* 2>/dev/null`).catch(() => {});
      
      this.logger.info('User session cleanup completed', { userId });
      this.emit('cleanup:user', { userId });
    } catch (error) {
      this.logger.error('Error cleaning user session', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get cleanup statistics
   */
  public async getStats(): Promise<{
    totalChromeProcesses: number;
    zombieProcesses: number;
    protectedSessions: number;
    lastCleanup: Date | null;
  }> {
    try {
      const { stdout: totalProcs } = await execAsync(
        "ps aux | grep -E '(chrome|chromium)' | grep -v grep | wc -l"
      ).catch(() => ({ stdout: '0' }));

      const { stdout: zombieProcs } = await execAsync(
        "ps aux | grep -E '(chrome|chromium)' | grep -v grep | awk '$8 ~ /Z/ {print}' | wc -l"
      ).catch(() => ({ stdout: '0' }));

      return {
        totalChromeProcesses: parseInt(totalProcs.trim()),
        zombieProcesses: parseInt(zombieProcs.trim()),
        protectedSessions: this.activeSessions.size,
        lastCleanup: this.lastCleanupTime ? new Date(this.lastCleanupTime) : null
      };
    } catch (error) {
      return {
        totalChromeProcesses: 0,
        zombieProcesses: 0,
        protectedSessions: this.activeSessions.size,
        lastCleanup: null
      };
    }
  }

  /**
   * Manually trigger cleanup (with safety checks)
   */
  public async manualCleanup(): Promise<number> {
    this.logger.info('Manual cleanup triggered');
    return this.cleanupZombieProcesses();
  }
}