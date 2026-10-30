export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { storage } from "@/lib/storage/adapter";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: { message: "File token required" } }, { status: 400 });
    }

    // Try fetching from temporary storage
    try {
      const { buffer, filename } = await storage.getTemp(token);
      const ext = path.extname(filename || token).toLowerCase();

      let contentType = "application/pdf";
      if (ext === ".png") contentType = "image/png";
      else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
      else if (ext === ".webp") contentType = "image/webp";

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${encodeURIComponent(filename || "document")}"`,
          "Cache-Control": "public, max-age=3600, immutable",
        },
      });
    } catch {
      // If not in temp, try direct base storage if token matches key
      try {
        const buffer = await storage.getFile(token);
        const ext = path.extname(token).toLowerCase();
        let contentType = "application/pdf";
        if (ext === ".png") contentType = "image/png";
        else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";

        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Content-Disposition": `inline; filename="${encodeURIComponent(path.basename(token))}"`,
            "Cache-Control": "public, max-age=3600, immutable",
          },
        });
      } catch {
        return NextResponse.json({ error: { message: "File not found or expired" } }, { status: 404 });
      }
    }
  } catch (err: any) {
    console.error("Error serving uploaded file:", err);
    return NextResponse.json(
      { error: { message: err?.message || "Failed to load document file" } },
      { status: 500 }
    );
  }
}
