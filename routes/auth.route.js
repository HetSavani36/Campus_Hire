import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authorizeRole from "../middlewares/authorizableRole.js";
import { getMe, login, logout, refreshController, registerCollege, registerCompany } from "../controllers/auth.controller.js";
import { rateLimitLogin } from "../middlewares/rateLimit.js";

const router = Router();

router.post("/register/college", registerCollege);
router.post("/register/company", registerCompany);
router.post("/login",rateLimitLogin,login);
router.post("/logout", verifyJWT, logout);
router.post("/refresh",refreshController);
router.get("/me", verifyJWT, getMe);


export default router;