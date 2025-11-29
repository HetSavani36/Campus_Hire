import { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler.js";
import { comparePassword, hashPassword } from "../utils/password.util.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
const prisma=new PrismaClient()

const changePassword=asyncHandler(async(req,res)=>{
    const {oldPassword,newPassword}=req.body
    if(!oldPassword || !newPassword) throw new ApiError(403,"please provide all details")

    const user=await prisma.user.findUnique({
        where:{id:req.user.id}
    }) 

    const isPasswordCorrect=await comparePassword(oldPassword,user.password)
    if(!isPasswordCorrect) throw new ApiError(403,"old password not matches")

    const hashedPassword=await hashPassword(newPassword)
    await prisma.user.update({
        where:{id:user.id},
        data:{password:hashedPassword}
    })

    res.json(
        new ApiResponse(200,{},"password changed successfully")
    )
})

export {changePassword}