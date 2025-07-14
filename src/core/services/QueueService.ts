import Queue from 'bull';
import { redisConfig } from '@/config/environment';
import { JOB_TYPES } from '@/shared/constants';

export interface QueueJobData {
  [key: string]: any;
}

export interface QueueJobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
}

export class QueueService {
  private static instance: QueueService;
  private queues: Map<string, Queue.Queue> = new Map();
  private processors: Map<string, (job: Queue.Job) => Promise<void>> = new Map();

  private constructor() {}

  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  public createQueue(name: string, options?: Queue.QueueOptions): Queue.Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queue = new Queue(name, {
      redis: {
        host: new URL(redisConfig.url).hostname,
        port: parseInt(new URL(redisConfig.url).port),
        password: redisConfig.password,
      },
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
      ...options,
    });

    this.setupQueueEventHandlers(queue, name);
    this.queues.set(name, queue);

    return queue;
  }

  private setupQueueEventHandlers(queue: Queue.Queue, name: string): void {
    queue.on('error', (error) => {
      console.error(`Queue ${name} error:`, error);
    });

    queue.on('waiting', (jobId) => {
      console.log(`Job ${jobId} waiting in queue ${name}`);
    });

    queue.on('active', (job) => {
      console.log(`Job ${job.id} started processing in queue ${name}`);
    });

    queue.on('completed', (job) => {
      console.log(`Job ${job.id} completed in queue ${name}`);
    });

    queue.on('failed', (job, err) => {
      console.error(`Job ${job.id} failed in queue ${name}:`, err);
    });

    queue.on('stalled', (jobId) => {
      console.warn(`Job ${jobId} stalled in queue ${name}`);
    });
  }

  public getQueue(name: string): Queue.Queue | undefined {
    return this.queues.get(name);
  }

  public async addJob(
    queueName: string,
    data: QueueJobData,
    options?: QueueJobOptions
  ): Promise<Queue.Job> {
    const queue = this.getQueue(queueName) || this.createQueue(queueName);
    
    const jobOptions: Queue.JobOptions = {
      priority: options?.priority,
      delay: options?.delay,
      attempts: options?.attempts,
      backoff: options?.backoff,
      removeOnComplete: options?.removeOnComplete,
      removeOnFail: options?.removeOnFail,
    };

    return await queue.add(data, jobOptions);
  }

  public async addJobWithType(
    queueName: string,
    jobType: string,
    data: QueueJobData,
    options?: QueueJobOptions
  ): Promise<Queue.Job> {
    const queue = this.getQueue(queueName) || this.createQueue(queueName);
    
    const jobOptions: Queue.JobOptions = {
      priority: options?.priority,
      delay: options?.delay,
      attempts: options?.attempts,
      backoff: options?.backoff,
      removeOnComplete: options?.removeOnComplete,
      removeOnFail: options?.removeOnFail,
    };

    return await queue.add(jobType, data, jobOptions);
  }

  public processJob(
    queueName: string,
    processor: (job: Queue.Job) => Promise<void>
  ): void {
    const queue = this.getQueue(queueName) || this.createQueue(queueName);
    queue.process(processor);
    this.processors.set(queueName, processor);
  }

  public processJobWithType(
    queueName: string,
    jobType: string,
    processor: (job: Queue.Job) => Promise<void>
  ): void {
    const queue = this.getQueue(queueName) || this.createQueue(queueName);
    queue.process(jobType, processor);
  }

  public async getJob(queueName: string, jobId: string): Promise<Queue.Job | null> {
    const queue = this.getQueue(queueName);
    if (!queue) return null;
    return await queue.getJob(jobId);
  }

  public async getJobs(
    queueName: string,
    status: Queue.JobStatus,
    start?: number,
    end?: number
  ): Promise<Queue.Job[]> {
    const queue = this.getQueue(queueName);
    if (!queue) return [];
    return await queue.getJobs([status], start, end);
  }

  public async getJobCounts(queueName: string): Promise<Queue.JobCounts> {
    const queue = this.getQueue(queueName);
    if (!queue) {
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0,
      };
    }
    return await queue.getJobCounts();
  }

  public async pauseQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    if (queue) {
      await queue.pause();
    }
  }

  public async resumeQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    if (queue) {
      await queue.resume();
    }
  }

  public async cleanQueue(
    queueName: string,
    grace: number,
    status: Queue.JobStatus
  ): Promise<void> {
    const queue = this.getQueue(queueName);
    if (queue) {
      await queue.clean(grace, status);
    }
  }

  public async removeJob(queueName: string, jobId: string): Promise<void> {
    const queue = this.getQueue(queueName);
    if (queue) {
      const job = await queue.getJob(jobId);
      if (job) {
        await job.remove();
      }
    }
  }

  public async emptyQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    if (queue) {
      await queue.empty();
    }
  }

  // Convenience methods for common job types
  public async addWhatsAppJob(
    jobType: string,
    data: QueueJobData,
    options?: QueueJobOptions
  ): Promise<Queue.Job> {
    return this.addJobWithType('whatsapp', jobType, data, options);
  }

  public async addInstagramJob(
    jobType: string,
    data: QueueJobData,
    options?: QueueJobOptions
  ): Promise<Queue.Job> {
    return this.addJobWithType('instagram', jobType, data, options);
  }

  public async addAIJob(
    jobType: string,
    data: QueueJobData,
    options?: QueueJobOptions
  ): Promise<Queue.Job> {
    return this.addJobWithType('ai', jobType, data, options);
  }

  public async addAutomationJob(
    jobType: string,
    data: QueueJobData,
    options?: QueueJobOptions
  ): Promise<Queue.Job> {
    return this.addJobWithType('automation', jobType, data, options);
  }

  public async addMaintenanceJob(
    jobType: string,
    data: QueueJobData,
    options?: QueueJobOptions
  ): Promise<Queue.Job> {
    return this.addJobWithType('maintenance', jobType, data, options);
  }

  // Health check
  public async healthCheck(): Promise<boolean> {
    try {
      const testQueue = this.createQueue('health-check');
      await testQueue.add({ test: true });
      await testQueue.empty();
      return true;
    } catch (error) {
      console.error('Queue health check failed:', error);
      return false;
    }
  }

  // Get all queues status
  public async getAllQueuesStatus(): Promise<Record<string, Queue.JobCounts>> {
    const status: Record<string, Queue.JobCounts> = {};
    
    for (const [name, queue] of this.queues) {
      status[name] = await queue.getJobCounts();
    }
    
    return status;
  }

  // Cleanup
  public async close(): Promise<void> {
    const closePromises = Array.from(this.queues.values()).map(queue => queue.close());
    await Promise.all(closePromises);
    this.queues.clear();
    this.processors.clear();
  }
} 