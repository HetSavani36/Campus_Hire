import jwt from "jsonwebtoken";

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      role: user.role,
      hasCompletedProfile: user.hasCompletedProfile,
    },
    process.env.ACCESS_TOKEN_SECRET_KEY,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m",
    }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      role: user.role,
      hasCompletedProfile: user.hasCompletedProfile,
    },
    process.env.REFRESH_TOKEN_SECRET_KEY,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d",
    }
  );
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET_KEY );
};

const options = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
};

export {generateAccessToken,generateRefreshToken,verifyRefreshToken,options}