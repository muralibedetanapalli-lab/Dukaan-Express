import { describe, expect, it } from "vitest";
import { haversineKm, isOpenNow } from "@/lib/geo";
import { applyBps, bpsToPercent, discountPercent, formatINR } from "@/lib/money";
import { toCsv } from "@/server/services/reports";
import { sniffImage } from "@/server/integrations/storage";

describe("geo", () => {
  it("computes Koramangala → Indiranagar distance", () => {
    const d = haversineKm({ lat: 12.9352, lng: 77.6245 }, { lat: 12.9719, lng: 77.6412 });
    expect(d).toBeGreaterThan(4);
    expect(d).toBeLessThan(5);
  });

  it("evaluates opening hours in IST, including overnight windows", () => {
    const hours = Array.from({ length: 7 }, (_, d) => ({ dayOfWeek: d, openTime: "09:00", closeTime: "21:00", isClosed: false }));
    // 2026-11-10T05:00Z = 10:30 IST
    expect(isOpenNow(hours, new Date("2026-11-10T05:00:00Z"))).toBe(true);
    // 2026-11-10T17:00Z = 22:30 IST
    expect(isOpenNow(hours, new Date("2026-11-10T17:00:00Z"))).toBe(false);
    const night = Array.from({ length: 7 }, (_, d) => ({ dayOfWeek: d, openTime: "18:00", closeTime: "02:00", isClosed: false }));
    expect(isOpenNow(night, new Date("2026-11-10T17:00:00Z"))).toBe(true);
  });
});

describe("money", () => {
  it("formats paise as INR and handles bps", () => {
    expect(formatINR(12345)).toBe("₹123.45");
    expect(formatINR(10000)).toBe("₹100");
    expect(applyBps(10000, 1250)).toBe(1250);
    expect(bpsToPercent(1250)).toBe("12.5%");
    expect(bpsToPercent(1000)).toBe("10%");
    expect(bpsToPercent(2000)).toBe("20%");
    expect(bpsToPercent(1234)).toBe("12.34%");
    expect(bpsToPercent(0)).toBe("0%");
    expect(discountPercent(10000, 7500)).toBe(25);
  });
});

describe("report export", () => {
  it("neutralises spreadsheet formula injection and quotes commas", () => {
    const csv = toCsv({
      title: "t",
      columns: [
        { key: "a", label: "A" },
        { key: "m", label: "M", money: true },
      ],
      rows: [{ a: "=HYPERLINK(\"x\")", m: 12345 }, { a: "x, y", m: 0 }],
    });
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('"x, y"');
    expect(csv).toContain("123.45");
  });
});

describe("upload sniffing", () => {
  it("accepts real PNG headers and rejects disguised files", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(sniffImage(png)?.mime).toBe("image/png");
    expect(sniffImage(Buffer.from("<script>alert(1)</script>"))).toBeNull();
  });
});
