import { PrismaClient } from "@prisma/client";
import { spawnSync } from "child_process";

async function run() {
  const prisma = new PrismaClient();
  const users = await prisma.user.count();
  await prisma.$disconnect();

  if (users > 0) {
    console.log("Database already has data. Skipping seed.");
    return;
  }

  console.log("Empty database. Running first-time seed...");
  const result = spawnSync("npx", ["tsx", "prisma/seed.ts"], {
    stdio: "inherit",
    shell: true
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
