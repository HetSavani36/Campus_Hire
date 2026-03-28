import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

export const redisConnection = new Redis(process.env.REDIS_URL,{
  tls:{
    rejectUnauthorized:false
  },
  family:4
});

redisConnection.on("connect", () => console.log("Connected to Upstash Redis!"));
redisConnection.on("error", (err) => console.log("Redis error:", err));