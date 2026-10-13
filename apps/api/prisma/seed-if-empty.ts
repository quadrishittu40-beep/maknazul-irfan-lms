import { PrismaClient } from "@prisma/client";
import { spawnSync } from "child_process";

async function run() {
  const prisma = new PrismaClient();
  const admin = await prisma.user.count({
    where: { email: "admin@maknazulirfan.org" }
  });
  await prisma.$disconnect();

  if (admin > 0) {
    console.log("Admin account already exists. Skipping seed.");
    return;
  }

  console.log("No admin account yet. Running first-time seed...");
  const result = spawnSync("npx", ["tsx", "prisma/seed.ts"], {
    stdio: "inherit",
    shell: true
  });
  if (result.status !== 0) {
    console.error("Seed failed. The server will still start, and the seed will retry on the next restart.");
  }
}

run().catch((e) => {
  console.error("Seed check failed (server will still start):", e);
});
