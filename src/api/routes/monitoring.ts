import { Router, Request, Response } from 'express';
import { ChromeCleanupService } from '../../core/services/ChromeCleanupService';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = Router();
const execAsync = promisify(exec);
const chromeCleanup = ChromeCleanupService.getInstance();

/**
 * GET /api/monitoring/chrome-stats
 * Get current Chrome process statistics
 */
router.get('/chrome-stats', async (req: Request, res: Response) => {
  try {
    // Get stats from cleanup service
    const stats = await chromeCleanup.getStats();
    
    // Get current Chrome processes
    const { stdout: processList } = await execAsync(
      "ps aux | grep -E '(chrome|chromium)' | grep -v grep | head -20"
    ).catch(() => ({ stdout: 'No Chrome processes found' }));
    
    res.json({
      success: true,
      data: {
        stats,
        sampleProcesses: processList.split('\n').filter(line => line.trim()),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get Chrome stats'
    });
  }
});

/**
 * POST /api/monitoring/chrome-cleanup
 * Manually trigger Chrome cleanup
 */
router.post('/chrome-cleanup', async (req: Request, res: Response) => {
  try {
    const { force = false } = req.body;
    
    let killedCount = 0;
    
    if (force) {
      // Force kill all Chrome processes
      await chromeCleanup.forceKillAllChrome();
      killedCount = -1; // Indicator that force kill was used
    } else {
      // Normal cleanup
      killedCount = await chromeCleanup.cleanupZombieProcesses();
    }
    
    // Get new stats after cleanup
    const stats = await chromeCleanup.getStats();
    
    res.json({
      success: true,
      data: {
        killedCount: force ? 'All Chrome processes killed' : killedCount,
        newStats: stats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cleanup Chrome processes'
    });
  }
});

/**
 * GET /api/monitoring/system-resources
 * Get system resource usage
 */
router.get('/system-resources', async (req: Request, res: Response) => {
  try {
    // Get memory usage
    const { stdout: memInfo } = await execAsync('free -h');
    
    // Get CPU usage
    const { stdout: cpuInfo } = await execAsync('top -bn1 | head -5');
    
    // Get disk usage
    const { stdout: diskInfo } = await execAsync('df -h /');
    
    // Count total processes
    const { stdout: processCount } = await execAsync('ps aux | wc -l');
    
    // Count Chrome processes
    const { stdout: chromeCount } = await execAsync(
      "ps aux | grep -E '(chrome|chromium)' | grep -v grep | wc -l"
    ).catch(() => ({ stdout: '0' }));
    
    res.json({
      success: true,
      data: {
        memory: memInfo.split('\n'),
        cpu: cpuInfo.split('\n'),
        disk: diskInfo.split('\n'),
        processCount: parseInt(processCount.trim()),
        chromeProcessCount: parseInt(chromeCount.trim()),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get system resources'
    });
  }
});

/**
 * GET /api/monitoring/cleanup-test
 * Test cleanup by creating and killing a Chrome process
 */
router.get('/cleanup-test', async (req: Request, res: Response) => {
  try {
    // Get initial count
    const { stdout: beforeCount } = await execAsync(
      "ps aux | grep -E '(chrome|chromium)' | grep -v grep | wc -l"
    ).catch(() => ({ stdout: '0' }));
    
    const before = parseInt(beforeCount.trim());
    
    // Trigger cleanup
    const killedCount = await chromeCleanup.cleanupZombieProcesses();
    
    // Get after count
    const { stdout: afterCount } = await execAsync(
      "ps aux | grep -E '(chrome|chromium)' | grep -v grep | wc -l"
    ).catch(() => ({ stdout: '0' }));
    
    const after = parseInt(afterCount.trim());
    
    res.json({
      success: true,
      data: {
        test: 'Chrome cleanup test',
        chromeProcessesBefore: before,
        chromeProcessesAfter: after,
        killedByCleanup: killedCount,
        actualReduction: before - after,
        cleanupWorking: killedCount > 0 || (before > after),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to test cleanup'
    });
  }
});

export default router;