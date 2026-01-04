import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const cleanupSessions = async () => {
  const now = new Date();
  const revokedRetention = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const expiredDeleted = await prisma.session.deleteMany({
    where: {
      expiresAt: { lt: now },
    },
  });

  const revokedDeleted = await prisma.session.deleteMany({
    where: {
      revokedAt: { not: null },
      expiresAt: { lt: revokedRetention },
    },
  });

  console.log({
    expiredDeleted: expiredDeleted.count,
    revokedDeleted: revokedDeleted.count,
  });
};
