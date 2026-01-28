import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authorizeRole from "../middlewares/authorizableRole.js";
import { changePassword } from "../controllers/user.controller.js";
import { rateLimitChangePassword } from "../middlewares/rateLimit.js";
import { requestIdMiddleware } from "../middlewares/requestId.js";

const router = Router();

router.use(verifyJWT)
router.use(requestIdMiddleware)

router.post("/change-password",rateLimitChangePassword,changePassword)

export default router;
