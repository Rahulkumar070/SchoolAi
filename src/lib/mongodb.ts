import mongoose from "mongoose";

const URI = process.env.MONGODB_URI ?? "";
if (!URI) throw new Error("MONGODB_URI is missing from environment variables.");

interface Cache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}
declare global {
  var __mg: Cache | undefined;
}

const c: Cache = global.__mg ?? { conn: null, promise: null };
global.__mg = c;

export async function connectDB() {
  // ✅ Already connected — return immediately
  if (c.conn) return c.conn;

  // ✅ Connection in progress — wait for it
  if (c.promise) {
    try {
      c.conn = await c.promise;
      return c.conn;
    } catch {
      // ✅ BUG FIX: Reset the rejected promise so the next call retries.
      // Without this, a failed connection is cached forever and every
      // subsequent request immediately throws the same stale error.
      c.promise = null;
      throw new Error("MongoDB connection failed. Retrying next request.");
    }
  }

  // ✅ Start a new connection
  c.promise = mongoose
    .connect(URI, {
      bufferCommands: false,

      // Pool: kept small for serverless (Vercel/Lambda kill idle connections anyway)
      maxPoolSize: 10,
      // ✅ FIX: Removed minPoolSize — in serverless environments this holds
      // open connections that get killed by the platform, causing
      // "MongoServerError: topology was destroyed" on the next request.

      // ✅ FIX: Increased from 5000 → 10000ms for MongoDB Atlas cold starts.
      // Atlas free-tier clusters spin down and need ~7-8s to wake up.
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 30_000,
      connectTimeoutMS: 10_000,

      // Heartbeat — keeps connection alive to avoid stale sockets on long idle
      heartbeatFrequencyMS: 30_000,
    })
    .catch((err) => {
      // ✅ BUG FIX: Clear the cached rejected promise so next caller can retry
      c.promise = null;
      throw err;
    });

  c.conn = await c.promise;
  return c.conn;
}
