import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authorizeRole from "../middlewares/authorizableRole.js";
import { makeStudentApplicationDecision } from "../controllers/mentor.controller.js";
import { rateLimitStudentApplicationDecisionForMentor } from "../middlewares/rateLimit.js";
import { requestIdMiddleware } from "../middlewares/requestId.js";

const router = Router();

router.use(verifyJWT)
router.use(requestIdMiddleware)

router.post("/application/:applicationId/:result",authorizeRole("mentor"),rateLimitStudentApplicationDecisionForMentor,makeStudentApplicationDecision);

export default router;