import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import { WebSocket } from "ws";
import * as schema from "./schema";
import { neonConfig } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure WebSocket globally for Neon
neonConfig.webSocketConstructor = WebSocket;
neonConfig.poolQueryViaFetch = true; // Enable fetch-based querying for better performance

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  connectionTimeoutMs: 30000,
  healthCheckIntervalMs: 30000,
};

// Configure connection pool optimized for serverless environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Increased for better concurrent performance
  idleTimeoutMillis: 60000, // 60 seconds idle timeout for better connection reuse
  connectionTimeoutMillis: RETRY_CONFIG.connectionTimeoutMs,
  maxUses: 15000, // Increased max uses per connection for better efficiency
  ssl: {
    rejectUnauthorized: false
  }
});

// Enhanced pool event listeners with detailed logging and retry logic
pool.on('error', async (err) => {
  console.error('Connection pool error:', err.message, '\nStack:', err.stack);
  await handlePoolError(err);
});

pool.on('connect', (client) => {
  console.log(`New client connected to pool (${pool.totalCount} total connections)`);
  client.on('error', async (err) => {
    console.error('Client connection error:', err.message);
    await handleClientError(client, err);
  });
});

pool.on('acquire', () => {
  const { totalCount, idleCount, waitingCount } = pool;
  console.debug(`Client acquired from pool (total: ${totalCount}, idle: ${idleCount}, waiting: ${waitingCount})`);
});

pool.on('remove', () => {
  console.debug(`Client removed from pool (${pool.totalCount} connections remaining)`);
});

// Create database client with connection pooling
export const db = drizzle(pool, { schema });

// Enhanced connection retry logic with exponential backoff
async function retryWithBackoff(operation: () => Promise<any>, retryCount = 0): Promise<any> {
  try {
    return await operation();
  } catch (error: any) {
    if (retryCount >= RETRY_CONFIG.maxRetries) {
      console.error(`Maximum retry attempts (${RETRY_CONFIG.maxRetries}) reached:`, error);
      throw error;
    }

    // Calculate delay with exponential backoff and jitter
    const baseDelay = Math.min(
      RETRY_CONFIG.initialDelayMs * Math.pow(2, retryCount),
      RETRY_CONFIG.maxDelayMs
    );
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;

    console.log(`Retry attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries} after ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(operation, retryCount + 1);
  }
}

// Enhanced pool error handler
async function handlePoolError(error: Error) {
  console.error('Pool error detected, attempting recovery...', error);
  try {
    await retryWithBackoff(async () => {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('Pool recovery successful');
    });
  } catch (err) {
    console.error('Pool recovery failed:', err);
    // Implement circuit breaker pattern
    await terminatePool();
  }
}

// Enhanced client error handler
async function handleClientError(client: any, error: Error) {
  console.error('Client error detected, attempting recovery...', error);
  try {
    client.release(error);
    await retryWithBackoff(async () => {
      const newClient = await pool.connect();
      await newClient.query('SELECT 1');
      newClient.release();
      console.log('Client recovery successful');
    });
  } catch (err) {
    console.error('Client recovery failed:', err);
  }
}

// Enhanced connection health check with improved error handling and retry logic
export const checkConnection = async () => {
  return retryWithBackoff(async () => {
    const client = await pool.connect();
    try {
      const startTime = Date.now();
      await client.query('SELECT 1'); // Simple health check query
      const duration = Date.now() - startTime;
      console.log(`Database connection successful (query time: ${duration}ms)`);
      return true;
    } finally {
      client.release();
    }
  });
};

// Periodic health check monitor
let healthCheckInterval: NodeJS.Timeout | null = null;

export const startHealthCheck = () => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  healthCheckInterval = setInterval(async () => {
    try {
      await checkConnection();
    } catch (error) {
      console.error('Health check failed:', error);
    }
  }, RETRY_CONFIG.healthCheckIntervalMs);
};

// Stop health check monitor
export const stopHealthCheck = () => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
};

// Enhanced pool monitoring with detailed metrics
export const getPoolStatus = async () => {
  try {
    const result = await pool.query(`
      SELECT current_setting('max_connections') as max_connections,
             (SELECT count(*) FROM pg_stat_activity) as current_connections,
             (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
             (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections,
             (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction') as idle_in_transaction,
             (SELECT extract(epoch from now() - backend_start)::integer 
              FROM pg_stat_activity 
              ORDER BY backend_start ASC 
              LIMIT 1) as oldest_connection_age
    `);
    
    return {
      poolStats: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
        utilizationRate: (pool.totalCount - pool.idleCount) / pool.totalCount
      },
      systemStats: {
        ...result.rows[0],
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('Failed to get pool status:', error);
    return {
      poolStats: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
        utilizationRate: (pool.totalCount - pool.idleCount) / pool.totalCount
      },
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Graceful pool termination
async function terminatePool() {
  console.error('Terminating connection pool due to unrecoverable error');
  stopHealthCheck();
  try {
    await pool.end();
  } catch (error) {
    console.error('Error while terminating pool:', error);
  }
}

// Enhanced graceful shutdown handler with timeout and connection draining
const cleanup = async () => {
  console.log('Starting graceful shutdown...');
  stopHealthCheck();
  let shuttingDown = false;

  try {
    const cleanupTimeout = setTimeout(() => {
      if (!shuttingDown) {
        console.error('Pool cleanup timed out after 5 seconds, forcing exit');
        process.exit(1);
      }
    }, 5000);

    // Wait for active queries to complete (up to 5 seconds)
    const waitForQueries = setInterval(async () => {
      const status = await getPoolStatus();
      if (status.poolStats.waitingCount === 0) {
        clearInterval(waitForQueries);
        shuttingDown = true;
        await pool.end();
        clearTimeout(cleanupTimeout);
        console.log('Connection pool closed successfully');
      }
    }, 100);

    // Force shutdown after 5 seconds
    setTimeout(() => {
      clearInterval(waitForQueries);
      if (!shuttingDown) {
        shuttingDown = true;
        pool.end().finally(() => {
          console.log('Connection pool force closed');
        });
      }
    }, 4900);
  } catch (err) {
    console.error('Error during cleanup:', err);
    process.exit(1);
  }
};

// Register cleanup handlers
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Start health check monitor
startHealthCheck();

export { pool };
