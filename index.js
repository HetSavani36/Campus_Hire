import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";


const app = express();
dotenv.config({
  path: "./.env",
});

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());


import authRouter from "./routes/auth.route.js"
import collegeRouter from "./routes/college.route.js";
import userRouter from "./routes/user.route.js"
import companyRouter from "./routes/company.route.js";
import studentRouter from "./routes/student.route.js";


app.use("/api/auth",authRouter)
app.use("/api/college", collegeRouter);
app.use("/api/user", userRouter);
app.use("/api/company", companyRouter);
app.use("/api/student", studentRouter);


const PORT=process.env.PORT || 3000

app.listen(PORT,()=>{
    console.log(`server running on : http://localhost:${PORT}`);
    console.log(`Api Available at : http://localhost:${PORT}/api`);
})


app.use("/", async(req, res) => {
    console.log('404:Page not found');
});

export { app };
