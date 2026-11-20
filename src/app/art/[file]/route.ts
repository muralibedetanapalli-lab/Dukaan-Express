import { productArtSvg } from "@/lib/product-art";

/** GET /art/<name>.svg?e=<emoji>&g=<from>-<to> — generated product icon (public, immutable). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const svg = productArtSvg(url.searchParams.get("e"), url.searchParams.get("g"));
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      // SVG served from our origin: never let it run scripts.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
