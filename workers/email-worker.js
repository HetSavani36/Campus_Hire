import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { sendCollabDecisionMail, sendMentorCredentialsMail, sendRegisterCollegeMail, sendRegisterCompanyMail, sendResetPasswordMail } from "./email-handler.js"
import { transporter } from "../utils/email-transporter.js";


transporter.verify((error, success) => {
  if (error) {
    console.error("Transporter error:", error);
  } else {
    console.log("Server is ready to send emails");
  }
});


const emailWorker = new Worker(
  "email-queue",
  async (job) => {
    const { name, data } = job;

    switch (name) {
      case "register-college":
        await sendRegisterCollegeMail(data);
        break;

      case "register-company":
        await sendRegisterCompanyMail(data);
        break;

      case "mentor-credentials":
        await sendMentorCredentialsMail(data);

      case "collab-decision":
        await sendCollabDecisionMail(data);

      case "reset-password":
        await sendResetPasswordMail(data);

      default:
        throw new Error(`Unknown job name: ${name}`);
    }
  },
  {
    connection: redisConnection,
    concurrency: 2,
  }
);

emailWorker.on("completed", (job) => {
  console.log(`✅ Email job ${job.name} completed`);
});

emailWorker.on("failed", (job, err) => {
  console.error(`❌ Email job ${job?.name} failed`, err);
});
