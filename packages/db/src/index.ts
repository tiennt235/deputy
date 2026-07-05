import { PrismaClient } from "@prisma/client";

// Single shared Prisma client (single-user local; one process).
export const prisma = new PrismaClient();

export * from "@prisma/client";
