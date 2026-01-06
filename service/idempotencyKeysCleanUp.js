import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const cleanupIdempotencyKeys = async () => {
  const deletedKeys=await prisma.idempotencyKey.deleteMany({
    where: {
      createdAt: {
        lt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour
      },
    },
  });
  console.log('Deleted Idempotency Keys: ',deletedKeys.count);
};
