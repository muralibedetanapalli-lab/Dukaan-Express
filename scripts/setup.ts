/**
 * Production setup — safe to run repeatedly. Never deletes anything.
 *
 *  1. Roles reference table
 *  2. Default product categories & subcategories (only if no categories exist yet)
 *  3. Super admin account from env: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME (optional)
 *     – creates the admin if missing; with ADMIN_RESET_PASSWORD=true also resets an existing one's password
 *
 * Run: `npx tsx scripts/setup.ts` locally, or `node scripts/dist/setup.mjs` inside the Docker image.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 2 }) });

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-");

const CATEGORIES: { name: string; taxBps: number; subs: string[] }[] = [
  { name: "Groceries", taxBps: 500, subs: ["Atta & Flours", "Rice & Grains", "Dals & Pulses", "Oils", "Masalas & Spices"] },
  { name: "Fruits & Vegetables", taxBps: 0, subs: ["Fresh Vegetables", "Fresh Fruits", "Herbs & Seasonings"] },
  { name: "Dairy Products", taxBps: 500, subs: ["Milk", "Curd & Yogurt", "Butter & Ghee", "Paneer & Cheese"] },
  { name: "Bakery", taxBps: 500, subs: ["Breads", "Cakes & Pastries", "Cookies & Rusks"] },
  { name: "Meat & Seafood", taxBps: 0, subs: ["Chicken", "Mutton", "Fish & Seafood", "Eggs"] },
  { name: "Medicines", taxBps: 1200, subs: ["Pain Relief", "Cold & Cough", "Vitamins", "First Aid"] },
  { name: "Stationery", taxBps: 1200, subs: ["Notebooks", "Pens & Pencils", "Art Supplies"] },
  { name: "Electronics", taxBps: 1800, subs: ["Chargers & Cables", "Batteries", "Audio"] },
  { name: "Household Essentials", taxBps: 1800, subs: ["Detergents", "Cleaners", "Kitchen Supplies", "Personal Care"] },
];

async function main() {
  // 1. Roles
  const roles = [
    { key: "SUPER_ADMIN" as const, name: "Super Admin", description: "Full platform access", permissions: ["*"] },
    { key: "SHOP_OWNER" as const, name: "Shop Owner", description: "Manage own shop, inventory and orders", permissions: ["shop:read", "shop:write", "inventory:*", "orders:shop"] },
    { key: "CUSTOMER" as const, name: "Customer", description: "Browse, order and track", permissions: ["catalog:read", "cart:*", "orders:own"] },
  ];
  for (const r of roles) await db.role.upsert({ where: { key: r.key }, create: r, update: r });
  console.log("✔ roles");

  // 2. Categories (first run only — admins manage them afterwards)
  if ((await db.category.count()) === 0) {
    for (const [i, c] of CATEGORIES.entries()) {
      await db.category.create({
        data: {
          name: c.name,
          slug: slug(c.name),
          taxRateBps: c.taxBps,
          sortOrder: i,
          subcategories: { create: c.subs.map((s, j) => ({ name: s, slug: slug(s), sortOrder: j })) },
        },
      });
    }
    console.log(`✔ ${CATEGORIES.length} categories`);
  } else {
    console.log("• categories already exist — skipped");
  }

  // 3. Admin
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("• ADMIN_EMAIL / ADMIN_PASSWORD not set — admin step skipped");
    return;
  }
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error("ADMIN_PASSWORD must be at least 10 characters with letters and numbers");
  }
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== "SUPER_ADMIN") throw new Error(`${email} exists but is not an admin`);
    if (process.env.ADMIN_RESET_PASSWORD === "true") {
      await db.user.update({
        where: { id: existing.id },
        data: { passwordHash: await bcrypt.hash(password, 12), status: "ACTIVE", sessionVersion: { increment: 1 } },
      });
      console.log(`✔ admin ${email} password reset`);
    } else {
      console.log(`• admin ${email} already exists — unchanged`);
    }
  } else {
    await db.user.create({
      data: { role: "SUPER_ADMIN", email, name: process.env.ADMIN_NAME?.trim() || "Platform Admin", passwordHash: await bcrypt.hash(password, 12) },
    });
    console.log(`✔ admin ${email} created`);
  }
}

main()
  .catch((e) => {
    console.error("✖ setup failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
