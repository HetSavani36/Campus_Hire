import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authorizeRole from "../middlewares/authorizableRole.js";
import { getMe, login, logout, refreshController, registerCollege, registerCompany } from "../controllers/auth.controller.js";
import { rateLimitLogin, rateLimitLogout, rateLimitMe, rateLimitRefresh, rateLimitRegisterCollege, rateLimitRegisterCompany } from "../middlewares/rateLimit.js";
import { requestIdMiddleware } from "../middlewares/requestId.js";

const router = Router();

router.use(requestIdMiddleware)
router.post("/register/college",rateLimitRegisterCollege,registerCollege);
router.post("/register/company",rateLimitRegisterCompany,registerCompany);
router.post("/login",rateLimitLogin,login);
router.post("/logout", verifyJWT, rateLimitLogout, logout);
router.post("/refresh",rateLimitRefresh,refreshController);
router.get("/me", verifyJWT,rateLimitMe,getMe);


export default router;