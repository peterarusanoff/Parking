import cluster from 'node:cluster';
import os from 'node:os';

/**
 * Cluster implementation for multi-core CPU support
 * Utilizes all available CPU cores for maximum performance
 */

const numCPUs = os.cpus().length;

if (cluster.isPrimary) {
  console.log(`🚀 Master process ${process.pid} is running`);
  console.log(`🔧 Starting ${numCPUs} worker processes...`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  // Listen for worker exits and restart
  cluster.on('exit', (worker, code, signal) => {
    console.log(
      `⚠️  Worker ${worker.process.pid ?? 'unknown'} died (${signal ?? code})`
    );
    console.log('🔄 Starting a new worker...');
    cluster.fork();
  });

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.log('📥 SIGTERM received, shutting down gracefully...');
    for (const id in cluster.workers) {
      const worker = cluster.workers[id];
      worker?.kill();
    }
  });
} else {
  // Worker processes run the Elysia app
  import('./index');
  console.log(`✅ Worker ${process.pid} started`);
}
