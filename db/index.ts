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

// Configure connection pool optimized for serverless environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 15, // Optimal pool size for moderate concurrency
  idleTimeoutMillis: 60000, // 60 seconds idle timeout
  connectionTimeoutMillis: 30000, // 30 seconds connection timeout
  maxUses: 10000, // Maximum number of queries before connection is destroyed
  ssl: {
    rejectUnauthorized: false
  }
});

// Add event listeners for the pool
pool.on('error', (err) => {
  console.error('Connection pool error:', err);
});

pool.on('connect', () => {
  console.log('New client connected to pool');
});

pool.on('acquire', () => {
  console.debug('Client acquired from pool');
});

pool.on('remove', () => {
  console.debug('Client removed from pool');
});

// Create database client with connection pooling
export const db = drizzle(pool, { schema });

// Enhanced connection health check with improved error handling
export const checkConnection = async () => {
  let retries = 5;
  let delay = 1000; // Start with 1 second delay

  while (retries > 0) {
    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1'); // Simple health check query
        console.log("Database connection successful");
        return true;
      } finally {
        client.release();
      }
    } catch (error: any) {
      retries--;
      console.error(`Database connection attempt failed. Retries left: ${retries}`);
      console.error('Connection error details:', error.message);
      
      if (retries === 0) {
        console.error('All connection attempts failed:', error);
        throw error;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Double the delay for next retry
    }
  }
  return false;
};

// Pool monitoring for health checks
export const getPoolStatus = async () => {
  try {
    const result = await pool.query(`
      SELECT current_setting('max_connections') as max_connections,
             (SELECT count(*) FROM pg_stat_activity) as current_connections,
             (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
             (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections,
             (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction') as idle_in_transaction
    `);
    
    return {
      poolStats: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      },
      systemStats: result.rows[0]
    };
  } catch (error) {
    console.error('Failed to get pool status:', error);
    return {
      poolStats: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      }
    };
  }
};

// Graceful shutdown handler
const cleanup = async () => {
  try {
    console.log('Cleaning up connection pool...');
    const cleanupTimeout = setTimeout(() => {
      console.error('Pool cleanup timed out after 5 seconds');
      process.exit(1);
    }, 5000);

    await pool.end();
    clearTimeout(cleanupTimeout);
    console.log('Connection pool closed successfully');
  } catch (err) {
    console.error('Error during cleanup:', err);
    process.exit(1);
  }
};

// Register cleanup handlers
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

export { pool };
