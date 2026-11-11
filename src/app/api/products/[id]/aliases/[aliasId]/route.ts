export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFoundingWrite } from "@/lib/auth/session";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; aliasId: string } }
) {
  try {
    const auth = await requireFoundingWrite();
    if (!auth.ok) return auth.response;

    const { id, aliasId } = params;
    await prisma.productAlias.deleteMany({
      where: { id: aliasId, product_id: id },
    });
    return NextResponse.json({ message: "Alias deleted" });
  } catch (error) {
    console.error("Error deleting alias:", error);
    return NextResponse.json(
      { error: { code: "DELETE_FAILED", message: "Failed to delete alias" } },
      { status: 500 }
    );
  }
}
