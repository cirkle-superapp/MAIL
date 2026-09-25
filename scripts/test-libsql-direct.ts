import { createClient } from "@libsql/client";

async function main() {
  const url = "libsql://mail-fortleem.aws-us-east-1.turso.io";
  const token = process.env.TURSO_TOKEN!;
  console.log("Testing createClient directly...");
  console.log("URL:", url, "| token set:", !!token, "| token len:", token.length);
  const client = createClient({ url, authToken: token });
  const result = await client.execute("SELECT COUNT(*) as count FROM Email");
  console.log("Direct libsql query result:", result.rows[0]);
}
main().catch((e: Error) => { console.error("ERROR:", e.message); process.exit(1); });
