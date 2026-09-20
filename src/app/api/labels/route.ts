import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const labels = await db.label.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ labels });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const name: string = (body?.name ?? "").trim();
  const color: string = (body?.color ?? "gray").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const existing = await db.label.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "Label already exists" }, { status: 400 });
  }
  const label = await db.label.create({ data: { name, color } });
  return NextResponse.json({ label });
}
