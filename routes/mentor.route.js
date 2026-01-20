import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authorizeRole from "../middlewares/authorizableRole.js";
import { makeStudentApplicationDecision } from "../controllers/mentor.controller.js";
import { rateLimitStudentApplicationDecisionForMentor } from "../middlewares/rateLimit.js";

const router = Router();

router.post("/application/:applicationId/:result",verifyJWT,authorizeRole("mentor"),rateLimitStudentApplicationDecisionForMentor,makeStudentApplicationDecision);

export default router;