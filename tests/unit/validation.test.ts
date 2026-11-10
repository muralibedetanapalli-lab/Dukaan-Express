import { describe, expect, it } from "vitest";
import { zPhone, zPincode } from "@/server/http";

describe("phone validation", () => {
  it.each([
    ["9123456780", "9123456780"], // starts with 91 — must not be stripped
    ["+91 98765 43210", "9876543210"],
    ["919876543210", "9876543210"],
    ["09876543210", "9876543210"],
    ["98765-43210", "9876543210"],
  ])("%s → %s", (input, out) => {
    expect(zPhone.parse(input)).toBe(out);
  });
  it.each(["12345", "5123456789", "98765432101"])("rejects %s", (input) => {
    expect(zPhone.safeParse(input).success).toBe(false);
  });
  it("validates pincodes", () => {
    expect(zPincode.safeParse("560034").success).toBe(true);
    expect(zPincode.safeParse("5600").success).toBe(false);
  });
});
