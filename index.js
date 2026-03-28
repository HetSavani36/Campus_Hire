import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import cron from "node-cron";
import { cleanupSessions } from "./service/sessionCleanUp.js";


const app = express();
dotenv.config({
  path: "./.env",
});

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "idempotency-key"],
  }),
);

app.use(express.static("public"));
app.use(cookieParser());
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

app.use((req, res, next) => {
  const label = `Request-${Date.now()}`;
  console.time(label);

  res.on("finish", () => {
    console.timeEnd(label);
  });

  next();
});

import authRouter from "./routes/auth.route.js"
import collegeRouter from "./routes/college.route.js";
import userRouter from "./routes/user.route.js"
import companyRouter from "./routes/company.route.js";
import studentRouter from "./routes/student.route.js";
import mentorRouter from "./routes/mentor.route.js";
import { cleanupIdempotencyKeys } from "./service/idempotencyKeysCleanUp.js";


app.use("/api/auth",authRouter)
app.use("/api/college", collegeRouter);
app.use("/api/user", userRouter);
app.use("/api/company", companyRouter);
app.use("/api/student", studentRouter);
app.use("/api/mentor", mentorRouter);


const PORT=process.env.PORT || 3000

app.listen(PORT,()=>{
  console.log(`server running on : http://localhost:${PORT}`);
  console.log(`Api Available at : http://localhost:${PORT}/api`);
})


app.use("/", async(req, res) => {
  console.log('404:Page not found');
});


cron.schedule("* 3 * * *", async () => {
  await cleanupSessions();
});

cron.schedule("0 * * * *", async () => {
  await cleanupIdempotencyKeys();
});

export { app };
