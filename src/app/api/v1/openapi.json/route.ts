import { NextResponse } from "next/server";
import { openApiDocument } from "@/server/openapi";

export function GET() {
  return NextResponse.json(openApiDocument());
}
