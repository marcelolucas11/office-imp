import { config } from '../config';

type Handler = (data: any) => Promise<void>;
const handlers = new Map<string, Handler>();
let bull: { queue: any; worker: any; connection: any } | null = null;
const QUEUE = 'office-imp';

export function registerJob(name: string, handler: Handler) {
  handlers.set(name, handler);
}

async function run(name: string, data: any) {
  const h = handlers.get(name);
  if (!h) throw new Error(`job desconhecido: ${name}`);
  await h(data);
}

/**
 * Inicia a fila. Com REDIS_URL usa BullMQ (um job por vez, para não competir por CPU);
 * sem Redis (desenvolvimento/testes) os jobs rodam no próprio processo.
 */
export async function startQueue(opts: { processJobs: boolean }) {
  if (!config.redisUrl) return;
  const { Queue, Worker } = await import('bullmq');
  const { default: IORedis } = await import('ioredis');
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE, { connection });
  const worker = opts.processJobs
    ? new Worker(QUEUE, async (job) => run(job.name, job.data), { connection: new IORedis(config.redisUrl, { maxRetriesPerRequest: null }), concurrency: 1 })
    : null;
  worker?.on('failed', (job, err) => console.error(`[fila] job ${job?.name} falhou:`, err?.message));
  bull = { queue, worker, connection };
}

export async function enqueue(name: string, data: any, opts: { attempts?: number; delayMs?: number } = {}) {
  if (bull) {
    await bull.queue.add(name, data, { attempts: opts.attempts ?? 2, backoff: { type: 'fixed', delay: 30000 }, delay: opts.delayMs, removeOnComplete: 100, removeOnFail: 200 });
    return;
  }
  const exec = () => run(name, data).catch((e) => console.error(`[fila] job ${name} falhou:`, e?.message ?? e));
  if (opts.delayMs) setTimeout(exec, opts.delayMs);
  else setImmediate(exec);
}

/** Aguarda os jobs em processo terminarem (somente modo sem Redis; usado em testes). */
export async function stopQueue() {
  if (!bull) return;
  await bull.worker?.close();
  await bull.queue.close();
  bull.connection.disconnect();
  bull = null;
}
