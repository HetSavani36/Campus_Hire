import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authorizeRole from "../middlewares/authorizableRole.js";
import { changePassword } from "../controllers/user.controller.js";
import { rateLimitChangePassword } from "../middlewares/rateLimit.js";

const router = Router();

router.post("/change-password",verifyJWT,rateLimitChangePassword,changePassword)

export default router;
