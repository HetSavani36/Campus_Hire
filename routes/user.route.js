import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authorizeRole from "../middlewares/authorizableRole.js";
import { changePassword } from "../controllers/user.controller.js";

const router = Router();

router.post("/change-password",verifyJWT,changePassword)

export default router;
