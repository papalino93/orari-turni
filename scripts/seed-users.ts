// Crea (o resetta la password di) i due account con accesso completo al
// tool: il titolare e l'accesso condiviso per chi lo aiuta. Da eseguire
// una volta a mano con `npx tsx scripts/seed-users.ts` — non è un seed
// automatico che gira ad ogni migrazione.
import { randomBytes } from "crypto";
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

config({ path: ".env.local", override: true });

const prisma = new PrismaClient();

function generatePassword(): string {
  return randomBytes(9).toString("base64url");
}

const ACCOUNTS = [
  { username: "andrea", name: "Andrea Ticonosco" },
  { username: "consulente", name: "Accesso consulente" },
];

async function main() {
  const created: { username: string; name: string; password: string }[] = [];

  for (const account of ACCOUNTS) {
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.upsert({
      where: { username: account.username },
      update: { passwordHash, name: account.name },
      create: { username: account.username, name: account.name, passwordHash },
    });

    created.push({ ...account, password });
  }

  console.log("\nAccount creati/aggiornati — password mostrate una sola volta, salvale ora:\n");
  for (const c of created) {
    console.log(`  ${c.name}`);
    console.log(`    username: ${c.username}`);
    console.log(`    password: ${c.password}\n`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
