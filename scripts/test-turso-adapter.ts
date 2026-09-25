import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

async function main() {
  const url = "libsql://mail-fortleem.aws-us-east-1.turso.io";
  const token = process.env.TURSO_TOKEN!;
  console.log("URL:", url, "| token set:", !!token);
  const adapter = new PrismaLibSQL({ url, authToken: token });
  const prisma = new PrismaClient({ adapter, log: ["error"] });
  const count = await prisma.email.count();
  console.log("Email count from Turso:", count);
  const first = await prisma.email.findFirst({ select: { subject: true, fromName: true } });
  console.log("First email:", JSON.stringify(first));
  await prisma.$disconnect();
}
main().catch((e: Error) => { console.error("ERROR:", e.message); process.exit(1); });
