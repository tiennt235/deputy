import { prisma } from "@loop/db";
await prisma.project.deleteMany({});
console.log("cleared");
process.exit(0);
