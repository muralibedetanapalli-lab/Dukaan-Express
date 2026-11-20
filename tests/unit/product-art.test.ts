import { describe, expect, it } from "vitest";
import { isGeneratedArt, productArtSvg, productArtUrl, productLook } from "@/lib/product-art";

describe("generated product icons", () => {
  it("picks the emoji from the product name and the colours from the category", () => {
    expect(productLook("Tomato (Hybrid)", "Fruits & Vegetables")).toEqual({ emoji: "🍅", from: "#d9f99d", to: "#86efac" });
    expect(productLook("Amul Taaza Milk", "Dairy Products").emoji).toBe("🥛");
    expect(productLook("Amul Butter", "Dairy Products").emoji).toBe("🧈");
    expect(productLook("Buttermilk", "Dairy Products").emoji).toBe("🥤");
  });

  it("falls back to the category emoji, then a shopping bag", () => {
    expect(productLook("Something new", "Medicines").emoji).toBe("💊");
    expect(productLook("Something new", "Unknown aisle").emoji).toBe("🛍️");
  });

  it("builds a stable /art URL that the SVG route can draw", () => {
    const url = productArtUrl("Tomato (Hybrid)", "Fruits & Vegetables");
    expect(url).toBe(productArtUrl("Tomato (Hybrid)", "Fruits & Vegetables"));
    expect(url.startsWith("/art/tomato-hybrid.svg?")).toBe(true);
    expect(isGeneratedArt(url)).toBe(true);
    expect(isGeneratedArt("https://res.cloudinary.com/x.jpg")).toBe(false);
    const q = new URL(url, "http://x").searchParams;
    const svg = productArtSvg(q.get("e"), q.get("g"));
    expect(svg).toContain("🍅");
    expect(svg).toContain('stop-color="#d9f99d"');
  });

  it("never lets URL input inject markup into the SVG", () => {
    const svg = productArtSvg('<script>alert(1)</script>', "zzz-<b>");
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<b>");
    expect(svg).toContain('stop-color="#dcfce7"');
  });
});
