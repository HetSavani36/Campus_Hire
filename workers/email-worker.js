import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import {
  sendCollabDecisionMail,
  sendCollabRequestRecievedMail,
  sendEmployeeCredentialsMail,
  sendJobDecisionMail,
  sendMentorCredentialsMail,
  sendMentorJobAssignMail,
  sendRegisterCollegeMail,
  sendRegisterCompanyMail,
  sendResetPasswordMail,
  sendStudentApplicationDecisionMail,
  sendStudentJobNotificationMail,
  sendStudentMentorDecisionMail,
  sendStudentsCredentialsMail,
} from "./email-handler.js";
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
        break;

      case "collab-decision":
        await sendCollabDecisionMail(data);
        break;

      case "reset-password":
        await sendResetPasswordMail(data);
        break;

      case "job-decision":
        await sendJobDecisionMail(data);
        break;

      case "assign-mentor":
        await sendMentorJobAssignMail(data);
        break;

      case "employee-credentials":
        await sendEmployeeCredentialsMail(data);
        break;

      case "collab-request":
        await sendCollabRequestRecievedMail(data);
        break;

      case "post-job":
        await sendJobAddedMail(data);
        break;

      case "student-application-decision-company":
        await sendStudentApplicationDecisionMail(data);
        break;

      case "job-notification":
        await sendStudentJobNotificationMail(data);
        break;

      case "mentor-decision":
        await sendStudentMentorDecisionMail(data);
        break;

      case "student-credentials":
        await sendStudentsCredentialsMail(data);
        break;

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
