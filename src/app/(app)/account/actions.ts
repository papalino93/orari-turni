"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function setPassword(userId: string, newPassword: string) {
  if (newPassword.length < 6) {
    return { error: "La password deve avere almeno 6 caratteri." };
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  revalidatePath("/account");
  return { error: null };
}
