import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import type { PoolClient } from "@neondatabase/serverless/types";
import { WebSocket } from "ws";
import * as schema from "./schema.js";
import { neonConfig } from '@neondatabase/serverless';
import { sql } from "drizzle-orm";

console.log("=== Database Initialization: Starting ===");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure WebSocket globally for Neon with Replit optimizations
console.log("Configuring Neon database connection...");
neonConfig.webSocketConstructor = WebSocket;
neonConfig.poolQueryViaFetch = true;
neonConfig.useSecureWebSocket = true;
neonConfig.pipeliningSupportValue = false;

// Enhanced pool configuration with auto-scaling
const POOL_CONFIG = {
  minConnections: 1,
  maxConnections: 3, // Reduced max connections for Replit environment
  initialConnections: 1,
  scaleUpStep: 1,
  scaleDownStep: 1,
  scaleUpThreshold: 0.8,
  scaleDownThreshold: 0.2,
  healthCheckInterval: 60000, // Increased interval to reduce overhead
  metricsWindow: 120000, // Increased window for better decision making
  cooldownPeriod: 60000, // Increased cooldown to prevent rapid scaling
  connectionTimeout: 10000, // Increased timeout for Replit environment
  maxRetries: 3,
  retryDelay: 1000,
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
        await this.createPool();
        await this.verifyPool();
        this.startMetricsCollection();
      } catch (error) {
        console.error("Pool initialization failed:", error);
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
        errors: 0
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
        errors: 1
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

  async query(...args: any[]) {
    if (!this.pool) {
      await this.initialize();
    }
    return this.pool!.query(...args);
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
  if (!db) {
    await poolManager.initialize();
    const client = await poolManager.getClient();
    db = drizzle(client, { schema });
  }

  try {
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database operation timeout')), 
      POOL_CONFIG.connectionTimeout)
    );
    
    const query = db.select({ value: sql`1` }).execute();
    await Promise.race([query, timeout]);
    
    return db;
  } catch (error) {
    console.warn("Database connection invalid, reinitializing...");
    await poolManager.initialize();
    const client = await poolManager.getClient();
    db = drizzle(client, { schema });
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
  query: async (...args: any[]) => poolManager.query(...args),
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
    
    const query = database.select({ value: sql`1` }).execute();
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
