import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
const prisma = new PrismaClient();
const secret = "local-test-secret-not-for-production";
function enc(plain) {
  const key = crypto.scryptSync(secret, "orari-turni:employee-password:v1", 32);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const e = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), e]).toString("base64");
}
await prisma.user.upsert({
  where: { username: "andrea" },
  update: {},
  create: { username: "andrea", name: "Andrea", passwordHash: await bcrypt.hash(process.env.E2E_ADMIN_PASSWORD, 10) },
});
for (const [i, [name, username, canEditMenu]] of [["Francesco Test", "francesco", false], ["Marta Test", "marta", true]].entries()) {
  const existing = await prisma.employee.findUnique({ where: { username } });
  if (!existing) await prisma.employee.create({ data: { name, username, password: enc(process.env.E2E_EMPLOYEE_PASSWORD), sortOrder: i, canEditMenu } });
}
console.log("seed ok");
await prisma.$disconnect();
