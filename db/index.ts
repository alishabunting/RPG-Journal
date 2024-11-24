import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import type { PoolClient } from "@neondatabase/serverless";
import { WebSocket } from "ws";
import * as schema from "./schema.js";
import { neonConfig } from '@neondatabase/serverless';
import { sql } from "drizzle-orm";

console.log("=== Database Initialization: Starting ===");

function validateDatabaseConfig() {
  const requiredEnvVars = ['DATABASE_URL', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGHOST', 'PGPORT'];
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required database environment variables: ${missing.join(', ')}`
    );
  }
  
  // Validate DATABASE_URL format
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith('postgres://') && !url?.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection string');
  }
}

validateDatabaseConfig();

// Configure WebSocket globally for Neon with Replit optimizations
console.log("Configuring Neon database connection...");
neonConfig.webSocketConstructor = WebSocket;
neonConfig.poolQueryViaFetch = true;
neonConfig.useSecureWebSocket = true;
neonConfig.pipelineConnect = false; // Disable pipelining for better stability
neonConfig.connectTimeout = 30000; // Increase connection timeout

// Enhanced pool configuration with auto-scaling
const POOL_CONFIG = {
  minConnections: 1,
  maxConnections: 3, // Increased slightly for better concurrency
  initialConnections: 1,
  scaleUpStep: 1,
  scaleDownStep: 1,
  scaleUpThreshold: 0.7, // Less aggressive scaling up
  scaleDownThreshold: 0.3,
  healthCheckInterval: 45000, // Increased to reduce overhead
  metricsWindow: 60000, // Reduced for more responsive scaling
  cooldownPeriod: 30000, // Reduced for more responsive scaling
  connectionTimeout: 15000, // Increased timeout for reliability
  maxRetries: 5, // Increased retries
  retryDelay: 2000, // Increased delay between retries
  maxUses: 5000, // Added connection recycling
  idleTimeout: 30000 // Added idle timeout
};

// Pool metrics tracking
interface PoolMetrics {
  timestamp: number;
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  responseTime: number;
  errors: number;
  maxConnections: number;
  minConnections: number;
  lastError?: string;
}

// Enhanced error handling with retries
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 5000;

async function withRetry<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES,
  initialDelay = INITIAL_RETRY_DELAY
): Promise<T> {
  let lastError: Error | null = null;
  let delay = initialDelay;

  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.error(`Operation failed (attempt ${i + 1}/${retries}):`, error);
      
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, MAX_RETRY_DELAY);
      }
    }
  }

  throw lastError;
}

class PoolManager {
  private pool: Pool | null = null;
  private metrics: PoolMetrics[] = [];
  private lastScaling: number = 0;
  private currentSize: number = POOL_CONFIG.initialConnections;
  private isScaling: boolean = false;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private initPromise: Promise<void> | null = null;

  async initialize() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        console.log("Initializing connection pool...");
        
        // Validate environment variables first
        validateDatabaseConfig();
        
        // Create and verify pool with retries
        let retries = 3;
        let lastError = null;
        
        while (retries > 0) {
          try {
            await this.createPool();
            await this.verifyPool();
            console.log("Pool verification successful");
            this.startMetricsCollection();
            return;
          } catch (error) {
            lastError = error;
            console.error(`Pool initialization attempt failed (${retries} retries left):`, error);
            retries--;
            
            if (retries > 0) {
              const delay = Math.min(1000 * (4 - retries), 3000);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }
        
        throw lastError || new Error("Pool initialization failed after all retries");
      } catch (error) {
        console.error("Fatal pool initialization error:", error);
        this.pool = null;
        this.initPromise = null;
        throw error;
      }
    })();

    return this.initPromise;
  }

  private async createPool() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: this.currentSize,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: POOL_CONFIG.connectionTimeout,
      maxUses: 7500,
      ssl: true
    });
  }

  private async verifyPool() {
    if (!this.pool) throw new Error("Pool not initialized");

    const verifyPromise = (async () => {
      const client = await this.pool!.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }
    })();

    try {
      await Promise.race([
        verifyPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), POOL_CONFIG.connectionTimeout)
        )
      ]);
    } catch (error) {
      await this.pool.end();
      throw error;
    }
  }

  private startMetricsCollection() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      this.collectMetrics().catch(error => {
        console.error("Metrics collection failed:", error);
      });
    }, POOL_CONFIG.healthCheckInterval);
  }

  private async collectMetrics() {
    if (!this.pool) return;

    const startTime = Date.now();
    try {
      const client = await this.pool.connect();
      const responseTime = Date.now() - startTime;
      client.release();

      const metric: PoolMetrics = {
        timestamp: Date.now(),
        totalConnections: this.pool.totalCount,
        activeConnections: this.pool.totalCount - this.pool.idleCount,
        idleConnections: this.pool.idleCount,
        waitingRequests: this.pool.waitingCount,
        responseTime,
        errors: 0,
        maxConnections: POOL_CONFIG.maxConnections,
        minConnections: POOL_CONFIG.minConnections
      };

      this.metrics.push(metric);
      this.pruneMetrics();
      await this.evaluateScaling();
    } catch (error) {
      console.error('Error collecting metrics:', error);
      this.metrics.push({
        timestamp: Date.now(),
        totalConnections: this.pool?.totalCount || 0,
        activeConnections: 0,
        idleConnections: 0,
        waitingRequests: 0,
        responseTime: 0,
        errors: 1,
        maxConnections: POOL_CONFIG.maxConnections,
        minConnections: POOL_CONFIG.minConnections,
        lastError: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async evaluateScaling() {
    if (
      this.isScaling || 
      !this.pool || 
      Date.now() - this.lastScaling < POOL_CONFIG.cooldownPeriod
    ) {
      return;
    }

    const recentMetrics = this.metrics.slice(-5);
    if (recentMetrics.length === 0) return;

    const avgUtilization = recentMetrics.reduce((sum, m) => 
      sum + m.activeConnections / Math.max(m.totalConnections, 1), 0
    ) / recentMetrics.length;

    try {
      this.isScaling = true;
      
      if (avgUtilization > POOL_CONFIG.scaleUpThreshold && 
          this.currentSize < POOL_CONFIG.maxConnections) {
        await this.scaleUp();
      } else if (avgUtilization < POOL_CONFIG.scaleDownThreshold && 
                 this.currentSize > POOL_CONFIG.minConnections) {
        await this.scaleDown();
      }
    } finally {
      this.isScaling = false;
    }
  }

  private async scaleUp() {
    const newSize = Math.min(
      this.currentSize + POOL_CONFIG.scaleUpStep, 
      POOL_CONFIG.maxConnections
    );
    await this.resizePool(newSize);
  }

  private async scaleDown() {
    const newSize = Math.max(
      this.currentSize - POOL_CONFIG.scaleDownStep, 
      POOL_CONFIG.minConnections
    );
    await this.resizePool(newSize);
  }

  private async resizePool(newSize: number) {
    if (!this.pool) return;

    console.log(`Resizing pool from ${this.currentSize} to ${newSize} connections`);

    try {
      const oldPool = this.pool;
      await this.createPool();
      await this.verifyPool();
      
      this.currentSize = newSize;
      this.lastScaling = Date.now();

      // Gracefully close old pool
      setTimeout(() => {
        oldPool.end().catch(console.error);
      }, 5000);
    } catch (error) {
      console.error('Error resizing pool:', error);
      throw error;
    }
  }

  private pruneMetrics() {
    const cutoff = Date.now() - POOL_CONFIG.metricsWindow;
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
  }

  async getClient(): Promise<PoolClient> {
    if (!this.pool) {
      await this.initialize();
    }
    return this.pool!.connect();
  }

  async query<T extends any[]>(queryText: string, values?: any[]) {
    if (!this.pool) {
      await this.initialize();
    }
    try {
      const result = await this.pool!.query<T>(queryText, values);
      return result;
    } catch (error) {
      console.error('Query error:', error);
      await this.initialize(); // Reinitialize on error
      return this.pool!.query<T>(queryText, values);
    }
  }

  async end() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  getMetrics() {
    return {
      currentSize: this.currentSize,
      metrics: this.metrics.slice(-5),
      lastScaling: this.lastScaling,
      poolStats: this.pool ? {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      } : null
    };
  }
}

const poolManager = new PoolManager();
let db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  const initializeDb = async () => {
    await poolManager.initialize();
    const client = await poolManager.getClient();
    return drizzle(client, { schema });
  };

  if (!db) {
    db = await withRetry(initializeDb);
  }

  try {
    // Verify connection with timeout
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database operation timeout')), 
      POOL_CONFIG.connectionTimeout)
    );
    
    const query = db.select({ value: sql`1` });
    await Promise.race([query, timeout]);
    
    return db;
  } catch (error) {
    console.warn("Database connection invalid, reinitializing...");
    db = await withRetry(initializeDb);
    return db;
  }
}

export const getPoolStatus = async () => {
  const metrics = poolManager.getMetrics();
  
  return {
    status: 'connected',
    poolStats: {
      currentSize: metrics.currentSize,
      recentMetrics: metrics.metrics,
      lastScalingOperation: new Date(metrics.lastScaling).toISOString(),
      currentPoolStats: metrics.poolStats
    }
  };
};

export const pool = {
  connect: async () => poolManager.getClient(),
  query: async <T extends any[] = any[]>(queryText: string, values?: any[]) => poolManager.query<T>(queryText, values),
  end: async () => {
    await poolManager.end();
    db = null;
  }
};

export const checkConnection = async () => {
  try {
    const database = await getDb();
    
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection check timeout')), 
      POOL_CONFIG.connectionTimeout)
    );
    
    const query = database.select({ value: sql`1` });
    await Promise.race([query, timeout]);
    
    return true;
  } catch (error) {
    console.error("Database connection check failed:", error);
    throw error;
  }
};

let healthCheckInterval: NodeJS.Timeout | null = null;

export const startHealthCheck = () => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  healthCheckInterval = setInterval(async () => {
    try {
      await checkConnection();
    } catch (error) {
      console.error("Health check failed:", error);
    }
  }, POOL_CONFIG.healthCheckInterval);

  console.log(`Health check started with ${POOL_CONFIG.healthCheckInterval}ms interval`);
};

export const stopHealthCheck = () => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    console.log("Health check stopped");
  }
};
