import { NextResponse } from "next/server";
import { z } from "zod";
import { extractProduct } from "@/lib/product-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  url: z.string().url(),
  includeDebug: z.boolean().optional(),
  usePlaywright: z.boolean().optional(),
});

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Request body must be valid JSON",
      },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Body must include a valid product URL",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await extractProduct(parsed.data.url, {
    includeDebug: parsed.data.includeDebug,
    usePlaywright: parsed.data.usePlaywright,
  });

  return NextResponse.json(result, { status: 200 });
}
