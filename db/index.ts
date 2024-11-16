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

// Configure connection pool optimized for serverless environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Increased for better concurrent performance
  idleTimeoutMillis: 60000, // 60 seconds idle timeout for better connection reuse
  connectionTimeoutMillis: 30000, // 30 seconds connection timeout for stability
  maxUses: 15000, // Increased max uses per connection for better efficiency
  ssl: {
    rejectUnauthorized: false
  }
});

// Enhanced pool event listeners with detailed logging
pool.on('error', (err) => {
  console.error('Connection pool error:', err.message, '\nStack:', err.stack);
});

pool.on('connect', (client) => {
  console.log(`New client connected to pool (${pool.totalCount} total connections)`);
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

// Enhanced connection health check with improved error handling and retry logic
export const checkConnection = async () => {
  let retries = 5;
  let delay = 1000; // Start with 1 second delay

  while (retries > 0) {
    try {
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
    } catch (error: any) {
      retries--;
      console.error(`Database connection attempt failed (${error.code}). Retries left: ${retries}`);
      console.error('Connection error details:', error.message);
      
      if (retries === 0) {
        console.error('All connection attempts failed:', error);
        throw new Error(`Database connection failed after 5 attempts: ${error.message}`);
      }
      
      // Exponential backoff with jitter
      const jitter = Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
      delay *= 2; // Double the delay for next retry
    }
  }
  return false;
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

// Enhanced graceful shutdown handler with timeout and connection draining
const cleanup = async () => {
  console.log('Starting graceful shutdown...');
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

export { pool };
