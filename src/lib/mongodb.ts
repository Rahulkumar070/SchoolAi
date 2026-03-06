import mongoose from "mongoose";

const URI = process.env.MONGODB_URI ?? "";
if (!URI) throw new Error("MONGODB_URI missing");

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
  if (c.conn) return c.conn;
  if (!c.promise) {
    c.promise = mongoose.connect(URI, {
      bufferCommands: false,
      // ✅ Connection pool — handle concurrent requests without waiting
      maxPoolSize: 10,
      minPoolSize: 2,
      // ✅ Faster timeout — fail fast instead of hanging 30s
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      connectTimeoutMS: 5000,
      // ✅ Keep connections alive — avoids cold reconnect on every request
      heartbeatFrequencyMS: 10000,
    });
  }
  c.conn = await c.promise;
  return c.conn;
}
