import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authorizeRole from "../middlewares/authorizableRole.js";
import { makeStudentApplicationDecision } from "../controllers/mentor.controller.js";

const router = Router();

router.post("/application/:applicationId/:result",verifyJWT,authorizeRole("mentor"),makeStudentApplicationDecision);

export default router;