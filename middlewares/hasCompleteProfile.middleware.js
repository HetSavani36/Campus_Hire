import { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
const prisma=new PrismaClient()

const hasCompletedProfile=asyncHandler(async(req,res,next)=>{ 
    if(!req.user.hasCompletedProfile && req.user.role==="student") throw new ApiError(403,"please complete your profile first")
    next()
})

export default hasCompletedProfile