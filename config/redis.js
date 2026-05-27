import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

export const redisConnection = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT
});

redisConnection.on("connect", () => {
  console.log("Connected to Docker Redis!");
});

redisConnection.on("error", (err) => {
  console.log("Redis error:", err);
});



// upstash

// import Redis from "ioredis";
// import dotenv from "dotenv";
// dotenv.config();

// export const redisConnection = new Redis(process.env.REDIS_URL,{
//   tls:{
//     rejectUnauthorized:false
//   },
//   family:4
// });

// redisConnection.on("connect", () => console.log("Connected to Upstash Redis!"));
// redisConnection.on("error", (err) => console.log("Redis error:", err));