/**
 * Seed data for local development and demos.
 *
 * Test credentials (development only — change in any shared environment):
 *   Super admin   admin@dukaanexpress.in      / Admin@12345
 *   Shop owners   <owner>@dukaanexpress.in    / Owner@12345   (see OWNERS below)
 *   Customers     priya@example.com / 9876543210, arjun@example.com / 9123456780   / Customer@123
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type OrderStatus } from "../src/generated/prisma/client";
import { computeQuote } from "../src/server/services/pricing";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-");

// ───────────── Placeholder artwork (local SVGs, no external image hosts needed) ─────────────
const ART_DIR = path.join(process.cwd(), "public", "seed");
mkdirSync(ART_DIR, { recursive: true });
function art(name: string, emoji: string, from: string, to: string) {
  const file = `${slug(name)}.svg`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="400" height="400" rx="48" fill="url(#g)"/><circle cx="200" cy="190" r="120" fill="#ffffff" fill-opacity="0.35"/><text x="200" y="245" font-size="150" text-anchor="middle" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${emoji}</text></svg>`;
  writeFileSync(path.join(ART_DIR, file), svg);
  return `/seed/${file}`;
}

// ───────────── Reference data ─────────────
const CATEGORIES = [
  { name: "Fruits & Vegetables", emoji: "🥦", c: ["#d9f99d", "#86efac"], tax: 0, subs: ["Fresh Vegetables", "Fresh Fruits", "Herbs & Seasonings"] },
  { name: "Dairy Products", emoji: "🥛", c: ["#e0f2fe", "#bae6fd"], tax: 500, subs: ["Milk", "Curd & Yogurt", "Butter & Ghee", "Paneer & Cheese"] },
  { name: "Groceries", emoji: "🌾", c: ["#fef3c7", "#fcd34d"], tax: 500, subs: ["Atta & Flours", "Rice & Grains", "Dals & Pulses", "Oils", "Masalas & Spices"] },
  { name: "Bakery", emoji: "🍞", c: ["#ffedd5", "#fdba74"], tax: 500, subs: ["Breads", "Cakes & Pastries", "Cookies & Rusks"] },
  { name: "Meat & Seafood", emoji: "🍗", c: ["#fee2e2", "#fca5a5"], tax: 0, subs: ["Chicken", "Mutton", "Fish & Seafood", "Eggs"] },
  { name: "Medicines", emoji: "💊", c: ["#ede9fe", "#c4b5fd"], tax: 1200, subs: ["Pain Relief", "Cold & Cough", "Vitamins", "First Aid"] },
  { name: "Stationery", emoji: "✏️", c: ["#e0e7ff", "#a5b4fc"], tax: 1200, subs: ["Notebooks", "Pens & Pencils", "Art Supplies"] },
  { name: "Electronics", emoji: "🔌", c: ["#e2e8f0", "#94a3b8"], tax: 1800, subs: ["Chargers & Cables", "Batteries", "Audio"] },
  { name: "Household Essentials", emoji: "🧴", c: ["#ccfbf1", "#5eead4"], tax: 1800, subs: ["Detergents", "Cleaners", "Kitchen Supplies", "Personal Care"] },
];

type P = { name: string; cat: string; sub: string; brand?: string; unit: string; unitValue?: number; mrp: number; emoji: string; g: number; desc?: string };
const PRODUCTS: P[] = [
  // Fruits & veg
  { name: "Tomato (Hybrid)", cat: "Fruits & Vegetables", sub: "Fresh Vegetables", unit: "kg", unitValue: 1, mrp: 4800, emoji: "🍅", g: 1000 },
  { name: "Onion", cat: "Fruits & Vegetables", sub: "Fresh Vegetables", unit: "kg", unitValue: 1, mrp: 5200, emoji: "🧅", g: 1000 },
  { name: "Potato", cat: "Fruits & Vegetables", sub: "Fresh Vegetables", unit: "kg", unitValue: 1, mrp: 4200, emoji: "🥔", g: 1000 },
  { name: "Carrot (Ooty)", cat: "Fruits & Vegetables", sub: "Fresh Vegetables", unit: "g", unitValue: 500, mrp: 3800, emoji: "🥕", g: 500 },
  { name: "Broccoli", cat: "Fruits & Vegetables", sub: "Fresh Vegetables", unit: "pcs", unitValue: 1, mrp: 8900, emoji: "🥦", g: 350 },
  { name: "Green Chilli", cat: "Fruits & Vegetables", sub: "Fresh Vegetables", unit: "g", unitValue: 100, mrp: 1500, emoji: "🌶️", g: 100 },
  { name: "Banana (Robusta)", cat: "Fruits & Vegetables", sub: "Fresh Fruits", unit: "dozen", unitValue: 1, mrp: 6900, emoji: "🍌", g: 1200 },
  { name: "Apple (Shimla)", cat: "Fruits & Vegetables", sub: "Fresh Fruits", unit: "kg", unitValue: 1, mrp: 22000, emoji: "🍎", g: 1000 },
  { name: "Alphonso Mango", cat: "Fruits & Vegetables", sub: "Fresh Fruits", unit: "kg", unitValue: 1, mrp: 39900, emoji: "🥭", g: 1000 },
  { name: "Watermelon", cat: "Fruits & Vegetables", sub: "Fresh Fruits", unit: "pcs", unitValue: 1, mrp: 7900, emoji: "🍉", g: 3000 },
  { name: "Coriander Leaves", cat: "Fruits & Vegetables", sub: "Herbs & Seasonings", unit: "g", unitValue: 100, mrp: 1200, emoji: "🌿", g: 100 },
  { name: "Lemon", cat: "Fruits & Vegetables", sub: "Herbs & Seasonings", unit: "pcs", unitValue: 4, mrp: 2000, emoji: "🍋", g: 200 },
  // Dairy
  { name: "Nandini Toned Milk", cat: "Dairy Products", sub: "Milk", brand: "Nandini", unit: "ml", unitValue: 500, mrp: 2400, emoji: "🥛", g: 520 },
  { name: "Amul Taaza Milk", cat: "Dairy Products", sub: "Milk", brand: "Amul", unit: "l", unitValue: 1, mrp: 5600, emoji: "🥛", g: 1040 },
  { name: "Nandini Curd", cat: "Dairy Products", sub: "Curd & Yogurt", brand: "Nandini", unit: "g", unitValue: 500, mrp: 3000, emoji: "🥣", g: 520 },
  { name: "Epigamia Greek Yogurt", cat: "Dairy Products", sub: "Curd & Yogurt", brand: "Epigamia", unit: "g", unitValue: 90, mrp: 6000, emoji: "🥄", g: 100 },
  { name: "Amul Butter", cat: "Dairy Products", sub: "Butter & Ghee", brand: "Amul", unit: "g", unitValue: 100, mrp: 6000, emoji: "🧈", g: 110 },
  { name: "Nandini Ghee", cat: "Dairy Products", sub: "Butter & Ghee", brand: "Nandini", unit: "ml", unitValue: 500, mrp: 36000, emoji: "🫙", g: 480 },
  { name: "Fresh Paneer", cat: "Dairy Products", sub: "Paneer & Cheese", unit: "g", unitValue: 200, mrp: 9500, emoji: "🧀", g: 210 },
  { name: "Amul Cheese Slices", cat: "Dairy Products", sub: "Paneer & Cheese", brand: "Amul", unit: "g", unitValue: 200, mrp: 14500, emoji: "🧀", g: 210 },
  // Groceries
  { name: "Aashirvaad Whole Wheat Atta", cat: "Groceries", sub: "Atta & Flours", brand: "Aashirvaad", unit: "kg", unitValue: 5, mrp: 29500, emoji: "🌾", g: 5000 },
  { name: "India Gate Basmati Rice", cat: "Groceries", sub: "Rice & Grains", brand: "India Gate", unit: "kg", unitValue: 1, mrp: 19900, emoji: "🍚", g: 1000 },
  { name: "Sona Masoori Rice", cat: "Groceries", sub: "Rice & Grains", unit: "kg", unitValue: 5, mrp: 42000, emoji: "🍚", g: 5000 },
  { name: "Toor Dal", cat: "Groceries", sub: "Dals & Pulses", unit: "kg", unitValue: 1, mrp: 18500, emoji: "🫘", g: 1000 },
  { name: "Moong Dal", cat: "Groceries", sub: "Dals & Pulses", unit: "g", unitValue: 500, mrp: 9800, emoji: "🫘", g: 500 },
  { name: "Fortune Sunflower Oil", cat: "Groceries", sub: "Oils", brand: "Fortune", unit: "l", unitValue: 1, mrp: 17500, emoji: "🛢️", g: 950 },
  { name: "MDH Garam Masala", cat: "Groceries", sub: "Masalas & Spices", brand: "MDH", unit: "g", unitValue: 100, mrp: 9200, emoji: "🌶️", g: 110 },
  { name: "Tata Salt", cat: "Groceries", sub: "Masalas & Spices", brand: "Tata", unit: "kg", unitValue: 1, mrp: 2800, emoji: "🧂", g: 1000 },
  // Bakery
  { name: "Whole Wheat Bread", cat: "Bakery", sub: "Breads", unit: "g", unitValue: 400, mrp: 5500, emoji: "🍞", g: 400 },
  { name: "Multigrain Bread", cat: "Bakery", sub: "Breads", unit: "g", unitValue: 400, mrp: 6500, emoji: "🥖", g: 400 },
  { name: "Butter Croissant", cat: "Bakery", sub: "Cakes & Pastries", unit: "pcs", unitValue: 2, mrp: 12000, emoji: "🥐", g: 160 },
  { name: "Chocolate Truffle Pastry", cat: "Bakery", sub: "Cakes & Pastries", unit: "pcs", unitValue: 1, mrp: 9500, emoji: "🍰", g: 120 },
  { name: "Osmania Biscuits", cat: "Bakery", sub: "Cookies & Rusks", unit: "g", unitValue: 250, mrp: 8000, emoji: "🍪", g: 260 },
  { name: "Milk Rusk", cat: "Bakery", sub: "Cookies & Rusks", unit: "g", unitValue: 300, mrp: 6000, emoji: "🥨", g: 310 },
  // Meat
  { name: "Chicken Curry Cut", cat: "Meat & Seafood", sub: "Chicken", unit: "g", unitValue: 500, mrp: 19900, emoji: "🍗", g: 500 },
  { name: "Chicken Breast Boneless", cat: "Meat & Seafood", sub: "Chicken", unit: "g", unitValue: 450, mrp: 27900, emoji: "🍗", g: 450 },
  { name: "Mutton Curry Cut", cat: "Meat & Seafood", sub: "Mutton", unit: "g", unitValue: 500, mrp: 54900, emoji: "🥩", g: 500 },
  { name: "Seer Fish Steaks", cat: "Meat & Seafood", sub: "Fish & Seafood", unit: "g", unitValue: 500, mrp: 69900, emoji: "🐟", g: 500 },
  { name: "Prawns (Medium)", cat: "Meat & Seafood", sub: "Fish & Seafood", unit: "g", unitValue: 250, mrp: 34900, emoji: "🦐", g: 250 },
  { name: "Farm Eggs", cat: "Meat & Seafood", sub: "Eggs", unit: "pcs", unitValue: 12, mrp: 9600, emoji: "🥚", g: 700 },
  // Medicines
  { name: "Paracetamol 650mg (15 tabs)", cat: "Medicines", sub: "Pain Relief", unit: "pack", unitValue: 1, mrp: 3400, emoji: "💊", g: 30 },
  { name: "Vicks VapoRub", cat: "Medicines", sub: "Cold & Cough", brand: "Vicks", unit: "g", unitValue: 50, mrp: 16500, emoji: "🫙", g: 70 },
  { name: "Honitus Cough Syrup", cat: "Medicines", sub: "Cold & Cough", brand: "Dabur", unit: "ml", unitValue: 100, mrp: 11500, emoji: "🧴", g: 150 },
  { name: "Vitamin C Chewable", cat: "Medicines", sub: "Vitamins", unit: "pack", unitValue: 1, mrp: 9900, emoji: "🍊", g: 60 },
  { name: "Band-Aid Strips (20)", cat: "Medicines", sub: "First Aid", brand: "Band-Aid", unit: "pack", unitValue: 1, mrp: 5000, emoji: "🩹", g: 30 },
  // Stationery
  { name: "Classmate Notebook (172 pages)", cat: "Stationery", sub: "Notebooks", brand: "Classmate", unit: "pcs", unitValue: 1, mrp: 6500, emoji: "📓", g: 300 },
  { name: "Reynolds Ball Pens (Pack of 10)", cat: "Stationery", sub: "Pens & Pencils", brand: "Reynolds", unit: "pack", unitValue: 1, mrp: 10000, emoji: "🖊️", g: 100 },
  { name: "Apsara Pencils (Pack of 10)", cat: "Stationery", sub: "Pens & Pencils", brand: "Apsara", unit: "pack", unitValue: 1, mrp: 6000, emoji: "✏️", g: 80 },
  { name: "Camlin Wax Crayons", cat: "Stationery", sub: "Art Supplies", brand: "Camlin", unit: "pack", unitValue: 1, mrp: 4500, emoji: "🖍️", g: 120 },
  // Electronics
  { name: "USB-C Fast Charging Cable", cat: "Electronics", sub: "Chargers & Cables", unit: "pcs", unitValue: 1, mrp: 49900, emoji: "🔌", g: 80 },
  { name: "20W USB-C Charger", cat: "Electronics", sub: "Chargers & Cables", unit: "pcs", unitValue: 1, mrp: 129900, emoji: "🔋", g: 120 },
  { name: "Duracell AA Batteries (4)", cat: "Electronics", sub: "Batteries", brand: "Duracell", unit: "pack", unitValue: 1, mrp: 22000, emoji: "🔋", g: 100 },
  { name: "Wired Earphones", cat: "Electronics", sub: "Audio", unit: "pcs", unitValue: 1, mrp: 59900, emoji: "🎧", g: 60 },
  // Household
  { name: "Surf Excel Matic Liquid", cat: "Household Essentials", sub: "Detergents", brand: "Surf Excel", unit: "l", unitValue: 1, mrp: 24500, emoji: "🧴", g: 1100 },
  { name: "Vim Dishwash Gel", cat: "Household Essentials", sub: "Kitchen Supplies", brand: "Vim", unit: "ml", unitValue: 500, mrp: 12500, emoji: "🧽", g: 550 },
  { name: "Lizol Floor Cleaner", cat: "Household Essentials", sub: "Cleaners", brand: "Lizol", unit: "ml", unitValue: 975, mrp: 22900, emoji: "🧹", g: 1050 },
  { name: "Harpic Toilet Cleaner", cat: "Household Essentials", sub: "Cleaners", brand: "Harpic", unit: "ml", unitValue: 500, mrp: 10800, emoji: "🚽", g: 560 },
  { name: "Dove Soap (Pack of 3)", cat: "Household Essentials", sub: "Personal Care", brand: "Dove", unit: "pack", unitValue: 1, mrp: 17400, emoji: "🧼", g: 300 },
  { name: "Colgate Toothpaste", cat: "Household Essentials", sub: "Personal Care", brand: "Colgate", unit: "g", unitValue: 200, mrp: 13500, emoji: "🪥", g: 220 },
  { name: "Garbage Bags (30)", cat: "Household Essentials", sub: "Kitchen Supplies", unit: "pack", unitValue: 1, mrp: 9900, emoji: "🗑️", g: 250 },
];

const OWNERS = [
  { key: "ravi", name: "Ravi Kumar", email: "ravi@dukaanexpress.in", phone: "9845011111" },
  { key: "anita", name: "Anita Sharma", email: "anita@dukaanexpress.in", phone: "9845022222" },
  { key: "suresh", name: "Suresh Gowda", email: "suresh@dukaanexpress.in", phone: "9845033333" },
  { key: "fatima", name: "Fatima Khan", email: "fatima@dukaanexpress.in", phone: "9845044444" },
  { key: "manoj", name: "Manoj Reddy", email: "manoj@dukaanexpress.in", phone: "9845055555" },
];

interface ShopSeed {
  name: string;
  owner: string | null;
  category: string;
  phone: string;
  addr: { line1: string; city: string; state: string; pincode: string; lat: number; lng: number };
  radius: number;
  commissionBps: number | null;
  prep: number;
  approval: "APPROVED" | "PENDING";
  active: boolean;
  /** categories this shop stocks, and price factor relative to MRP */
  stocks: { cat: string; factor: number; skip?: number }[];
  gst?: string;
}

const SHOPS: ShopSeed[] = [
  {
    name: "FreshMart Supermarket",
    owner: "ravi",
    category: "Groceries",
    phone: "8041111111",
    addr: { line1: "80 Feet Road, 4th Block, Koramangala", city: "Bengaluru", state: "Karnataka", pincode: "560034", lat: 12.9352, lng: 77.6245 },
    radius: 6,
    commissionBps: null,
    prep: 8,
    approval: "APPROVED",
    active: true,
    gst: "29ABCDE1234F1Z5",
    stocks: [
      { cat: "Groceries", factor: 0.9 },
      { cat: "Dairy Products", factor: 0.97 },
      { cat: "Fruits & Vegetables", factor: 0.85, skip: 3 },
      { cat: "Household Essentials", factor: 0.88 },
      { cat: "Bakery", factor: 0.95, skip: 2 },
    ],
  },
  {
    name: "Green Basket Organics",
    owner: "anita",
    category: "Fruits & Vegetables",
    phone: "8042222222",
    addr: { line1: "100 Feet Road, HAL 2nd Stage, Indiranagar", city: "Bengaluru", state: "Karnataka", pincode: "560038", lat: 12.9719, lng: 77.6412 },
    radius: 7,
    commissionBps: 1200,
    prep: 10,
    approval: "APPROVED",
    active: true,
    stocks: [
      { cat: "Fruits & Vegetables", factor: 0.8 },
      { cat: "Dairy Products", factor: 1.0, skip: 4 },
    ],
  },
  {
    name: "Nandini Milk Parlour",
    owner: "suresh",
    category: "Dairy Products",
    phone: "8043333333",
    addr: { line1: "27th Main, Sector 1, HSR Layout", city: "Bengaluru", state: "Karnataka", pincode: "560102", lat: 12.9116, lng: 77.6474 },
    radius: 5,
    commissionBps: 800,
    prep: 5,
    approval: "APPROVED",
    active: true,
    stocks: [
      { cat: "Dairy Products", factor: 0.95 },
      { cat: "Bakery", factor: 0.92 },
    ],
  },
  {
    name: "Wellness Pharmacy",
    owner: "fatima",
    category: "Medicines",
    phone: "8044444444",
    addr: { line1: "16th Main, BTM 2nd Stage", city: "Bengaluru", state: "Karnataka", pincode: "560076", lat: 12.9166, lng: 77.6101 },
    radius: 6,
    commissionBps: 700,
    prep: 6,
    approval: "APPROVED",
    active: true,
    stocks: [
      { cat: "Medicines", factor: 0.9 },
      { cat: "Household Essentials", factor: 0.95, skip: 2 },
    ],
  },
  {
    name: "Coastal Catch Meats",
    owner: "manoj",
    category: "Meat & Seafood",
    phone: "8045555555",
    addr: { line1: "1st Cross, 5th Block, Koramangala", city: "Bengaluru", state: "Karnataka", pincode: "560095", lat: 12.938, lng: 77.627 },
    radius: 5,
    commissionBps: 1500,
    prep: 15,
    approval: "APPROVED",
    active: true,
    stocks: [{ cat: "Meat & Seafood", factor: 0.92 }],
  },
  {
    name: "Sri Ganesh Stationery & Electronics",
    owner: "ravi",
    category: "Stationery",
    phone: "8046666666",
    addr: { line1: "Jyoti Nivas College Road, Koramangala", city: "Bengaluru", state: "Karnataka", pincode: "560034", lat: 12.934, lng: 77.619 },
    radius: 4,
    commissionBps: null,
    prep: 10,
    approval: "APPROVED",
    active: true,
    stocks: [
      { cat: "Stationery", factor: 0.9 },
      { cat: "Electronics", factor: 0.75 },
    ],
  },
  {
    name: "Daily Needs Whitefield",
    owner: null,
    category: "Groceries",
    phone: "8047777777",
    addr: { line1: "ITPL Main Road, Whitefield", city: "Bengaluru", state: "Karnataka", pincode: "560066", lat: 12.9698, lng: 77.75 },
    radius: 5,
    commissionBps: null,
    prep: 10,
    approval: "PENDING",
    active: false,
    stocks: [{ cat: "Groceries", factor: 0.93 }],
  },
];

const roundPrice = (paise: number) => Math.max(500, Math.round(paise / 100) * 100);

async function reset() {
  // Children first. Keeps the seed re-runnable.
  const tables = [
    "ShipmentTrackingEvent", "Shipment", "DeliveryPartner", "Commission", "ShopSettlement", "Refund", "Payment",
    "OrderStatusHistory", "OrderModification", "CouponRedemption", "Review", "SupportTicket", "OrderItem", "Order",
    "CartItem", "Cart", "Coupon", "ShopInventory", "ProductVariant", "ProductImage", "Product", "ProductAttribute",
    "Subcategory", "ShopImage", "ShopOperatingHours", "ShopAddress", "Shop", "Category", "CustomerAddress",
    "Notification", "DeviceToken", "AuditLog", "Customer", "ShopOwner", "Otp", "User", "Role", "Setting", "Banner",
    "ServiceArea", "WebhookEvent", "IdempotencyKey",
  ];
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

async function main() {
  console.log("Seeding Dukaan Express…");
  await reset();

  await db.role.createMany({
    data: [
      { key: "SUPER_ADMIN", name: "Super Admin", description: "Full platform access", permissions: ["*"] },
      { key: "SHOP_OWNER", name: "Shop Owner", description: "Manage own shop, inventory and orders", permissions: ["shop:read", "shop:write", "inventory:*", "orders:shop"] },
      { key: "CUSTOMER", name: "Customer", description: "Browse, order and track", permissions: ["catalog:read", "cart:*", "orders:own"] },
    ],
  });

  const adminPw = await bcrypt.hash("Admin@12345", 12);
  const ownerPw = await bcrypt.hash("Owner@12345", 12);
  await db.user.create({ data: { role: "SUPER_ADMIN", name: "Platform Admin", email: "admin@dukaanexpress.in", phone: "9000000000", passwordHash: adminPw } });

  const ownerIds: Record<string, string> = {};
  for (const o of OWNERS) {
    const u = await db.user.create({
      data: { role: "SHOP_OWNER", name: o.name, email: o.email, phone: o.phone, passwordHash: ownerPw, shopOwner: { create: {} } },
      include: { shopOwner: true },
    });
    ownerIds[o.key] = u.shopOwner!.id;
  }

  // Categories
  const catIds: Record<string, string> = {};
  const subIds: Record<string, string> = {};
  for (const [i, c] of CATEGORIES.entries()) {
    const cat = await db.category.create({
      data: {
        name: c.name,
        slug: slug(c.name),
        imageUrl: art(`cat-${c.name}`, c.emoji, c.c[0], c.c[1]),
        taxRateBps: c.tax,
        sortOrder: i,
        subcategories: { create: c.subs.map((s, j) => ({ name: s, slug: slug(s), sortOrder: j })) },
      },
      include: { subcategories: true },
    });
    catIds[c.name] = cat.id;
    for (const s of cat.subcategories) subIds[`${c.name}/${s.name}`] = s.id;
  }

  await db.productAttribute.createMany({
    data: [
      { name: "Diet", values: ["Veg", "Non-veg", "Vegan", "Eggetarian"] },
      { name: "Organic", values: ["Yes", "No"] },
      { name: "Shelf life", values: ["1 day", "3 days", "7 days", "1 month", "6 months", "1 year"] },
    ],
  });

  // Products (global master)
  const products: { id: string; p: P }[] = [];
  for (const [i, p] of PRODUCTS.entries()) {
    const c = CATEGORIES.find((x) => x.name === p.cat)!;
    const prod = await db.product.create({
      data: {
        name: p.name,
        slug: slug(p.name),
        description: p.desc ?? `${p.name}${p.brand ? ` by ${p.brand}` : ""}. Sourced fresh from trusted local suppliers and delivered in minutes.`,
        brand: p.brand ?? null,
        categoryId: catIds[p.cat],
        subcategoryId: subIds[`${p.cat}/${p.sub}`],
        sku: `DX-${String(i + 1).padStart(4, "0")}`,
        unit: p.unit,
        unitValue: p.unitValue ?? null,
        weightGrams: p.g,
        lengthCm: Math.max(8, Math.round(Math.cbrt(p.g) * 2)),
        breadthCm: Math.max(6, Math.round(Math.cbrt(p.g) * 1.5)),
        heightCm: Math.max(4, Math.round(Math.cbrt(p.g))),
        attributes: { Diet: p.cat === "Meat & Seafood" ? "Non-veg" : "Veg" },
        // stagger createdAt so "recently added" is meaningful
        createdAt: new Date(Date.now() - (PRODUCTS.length - i) * 3600_000 * 6),
        images: { create: [{ url: art(p.name, p.emoji, c.c[0], c.c[1]), alt: p.name }] },
      },
    });
    products.push({ id: prod.id, p });
  }

  // Shops + shop-specific inventory
  const shopRows: { id: string; seed: ShopSeed }[] = [];
  for (const [si, s] of SHOPS.entries()) {
    const shop = await db.shop.create({
      data: {
        name: s.name,
        slug: slug(s.name),
        description: `Your neighbourhood ${s.category.toLowerCase()} store in ${s.addr.line1.split(",").pop()?.trim()}.`,
        ownerId: s.owner ? ownerIds[s.owner] : null,
        categoryId: catIds[s.category],
        contactPhone: s.phone.replace(/^80/, "98"),
        contactEmail: `${slug(s.name)}@shops.dukaanexpress.in`,
        gstNumber: s.gst ?? null,
        logoUrl: art(`shop-${s.name}`, CATEGORIES.find((c) => c.name === s.category)!.emoji, "#14532d", "#22c55e"),
        approvalStatus: s.approval,
        isActive: s.active,
        deliveryRadiusKm: s.radius,
        commissionBps: s.commissionBps,
        avgPrepMinutes: s.prep,
        rating: s.approval === "APPROVED" ? 4 + ((si * 37) % 10) / 10 : 0,
        ratingCount: s.approval === "APPROVED" ? 40 + si * 23 : 0,
        address: { create: { line1: s.addr.line1, city: s.addr.city, state: s.addr.state, pincode: s.addr.pincode, latitude: s.addr.lat, longitude: s.addr.lng } },
        hours: {
          create: Array.from({ length: 7 }, (_, d) => ({
            dayOfWeek: d,
            openTime: s.category === "Medicines" ? "00:00" : "06:00",
            closeTime: s.category === "Medicines" ? "23:59" : "23:30",
            isClosed: false,
          })),
        },
      },
    });
    shopRows.push({ id: shop.id, seed: s });

    let n = 0;
    for (const st of s.stocks) {
      const items = products.filter((x) => x.p.cat === st.cat);
      for (const [k, item] of items.entries()) {
        if (st.skip && k % st.skip === st.skip - 1) continue;
        // deterministic per-shop price variation so the same product differs between shops
        const jitter = 1 + (((si + 1) * (k + 3) * 7) % 9) / 100 - 0.04;
        const price = Math.min(item.p.mrp, roundPrice(item.p.mrp * st.factor * jitter));
        const stock = (si * 13 + k * 7) % 11 === 0 ? 3 : 20 + ((si * 17 + k * 11) % 60);
        await db.shopInventory.create({
          data: {
            shopId: shop.id,
            productId: item.id,
            shopSku: `${slug(s.name).slice(0, 3).toUpperCase()}-${String(++n).padStart(3, "0")}`,
            mrp: item.p.mrp,
            sellingPrice: price,
            stock,
            lowStockThreshold: 5,
            maxPerOrder: item.p.cat === "Medicines" ? 3 : 10,
          },
        });
      }
    }
  }

  // Variants example: Milk in two pack sizes at FreshMart
  const freshmart = shopRows[0];
  const amul = products.find((x) => x.p.name === "Amul Taaza Milk")!;
  const v500 = await db.productVariant.create({ data: { productId: amul.id, name: "500 ml", unitValue: 500, weightGrams: 520 } });
  await db.shopInventory.create({
    data: { shopId: freshmart.id, productId: amul.id, variantId: v500.id, variantKey: v500.id, mrp: 2900, sellingPrice: 2800, stock: 40, shopSku: "FRE-V01" },
  });

  // Customers
  const customers = [];
  const customerPw = await bcrypt.hash("Customer@123", 12);
  for (const c of [
    { name: "Priya Nair", phone: "9876543210", email: "priya@example.com", addr: { label: "Home", line1: "Flat 402, Prestige Acropolis, 20th Main", landmark: "Near Forum Mall", pincode: "560034", lat: 12.9339, lng: 77.6229 } },
    { name: "Arjun Mehta", phone: "9123456780", email: "arjun@example.com", addr: { label: "Home", line1: "12, 3rd Cross, Domlur Layout", landmark: "Opp. Domlur Park", pincode: "560071", lat: 12.9609, lng: 77.6387 } },
  ]) {
    const u = await db.user.create({
      data: {
        role: "CUSTOMER",
        name: c.name,
        phone: c.phone,
        email: c.email,
        passwordHash: customerPw,
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            cart: { create: {} },
            addresses: {
              create: [
                { label: c.addr.label, name: c.name, phone: c.phone, line1: c.addr.line1, landmark: c.addr.landmark, city: "Bengaluru", state: "Karnataka", pincode: c.addr.pincode, latitude: c.addr.lat, longitude: c.addr.lng, isDefault: true },
                { label: "Work", name: c.name, phone: c.phone, line1: "Embassy Tech Square, Outer Ring Road", landmark: "Kadubeesanahalli", city: "Bengaluru", state: "Karnataka", pincode: "560103", latitude: 12.9354, longitude: 77.6946, isDefault: false },
              ],
            },
          },
        },
      },
      include: { customer: { include: { addresses: true } } },
    });
    customers.push(u);
  }

  // Coupons, banners, service areas
  await db.coupon.createMany({
    data: [
      { code: "WELCOME50", description: "₹50 off your first order above ₹199", type: "FLAT", value: 5000, minOrderAmount: 19900, firstOrderOnly: true, perUserLimit: 1 },
      { code: "SAVE10", description: "10% off up to ₹100 on orders above ₹299", type: "PERCENT", value: 1000, maxDiscount: 10000, minOrderAmount: 29900, perUserLimit: 5 },
      { code: "FRESH20", description: "20% off fruits & veggies at Green Basket (max ₹80)", type: "PERCENT", value: 2000, maxDiscount: 8000, minOrderAmount: 19900, shopId: shopRows[1].id, perUserLimit: 3 },
    ],
  });
  await db.banner.createMany({
    data: [
      { title: "Groceries in 15 minutes", subtitle: "From stores in your neighbourhood", bgColor: "#15803d", linkUrl: "/search?category=groceries", sortOrder: 0 },
      { title: "Farm-fresh fruits & veggies", subtitle: "Use FRESH20 at Green Basket", bgColor: "#b45309", linkUrl: "/search?category=fruits-vegetables", sortOrder: 1 },
      { title: "Pharmacy at your door", subtitle: "Medicines delivered 24×7", bgColor: "#6d28d9", linkUrl: "/search?category=medicines", sortOrder: 2 },
    ],
  });
  await db.serviceArea.create({
    data: {
      city: "Bengaluru",
      state: "Karnataka",
      centerLat: 12.9352,
      centerLng: 77.6245,
      radiusKm: 25,
      localities: [
        { name: "Koramangala", lat: 12.9352, lng: 77.6245, pincode: "560034" },
        { name: "Indiranagar", lat: 12.9719, lng: 77.6412, pincode: "560038" },
        { name: "HSR Layout", lat: 12.9116, lng: 77.6474, pincode: "560102" },
        { name: "BTM Layout", lat: 12.9166, lng: 77.6101, pincode: "560076" },
        { name: "Domlur", lat: 12.9609, lng: 77.6387, pincode: "560071" },
        { name: "Jayanagar", lat: 12.925, lng: 77.5938, pincode: "560041" },
        { name: "Whitefield", lat: 12.9698, lng: 77.75, pincode: "560066" },
      ], pincodes: ["560034", "560038", "560102", "560076", "560095", "560071", "560103", "560066", "560041", "560008"] },
  });

  // Historical orders for analytics (delivered / cancelled), computed with the real pricing engine
  console.log("Creating order history…");
  const statuses: OrderStatus[] = ["DELIVERED", "DELIVERED", "DELIVERED", "DELIVERED", "DELIVERED", "DELIVERED", "CANCELLED", "SHOP_REJECTED"];
  const partner = await db.deliveryPartner.create({ data: { name: "Mock Hyperlocal Express (bike)", shiprocketCourierId: 901 } });
  let seq = 0;
  for (let day = 29; day >= 1; day--) {
    const perDay = 1 + (day % 3);
    for (let k = 0; k < perDay; k++) {
      seq++;
      const shop = shopRows[seq % 6];
      const cust = customers[seq % 2];
      const addr = cust.customer!.addresses.find((a) => a.isDefault)!;
      const inv = await db.shopInventory.findMany({ where: { shopId: shop.id }, include: { product: { include: { category: true, images: true } } }, take: 6, skip: seq % 4 });
      const chosen = inv.slice(0, 2 + (seq % 3));
      const lines = chosen.map((i, idx) => ({ mrp: i.mrp, price: i.sellingPrice, quantity: 1 + ((seq + idx) % 3), taxRateBps: i.product.category.taxRateBps ?? 500 }));
      const commissionBps = shop.seed.commissionBps ?? 1000;
      const q = computeQuote(
        lines,
        {
          delivery: { baseFee: 2500, perKmFee: 500, freeDeliveryThreshold: 49900 },
          tax: { enabled: true, pricesInclusive: true, deliveryFeeTaxBps: 1800 },
          order: { minOrderAmount: 9900 },
          coupons: { maxDiscountPercentOfOrder: 50 },
          commissionBps,
        },
        { distanceKm: 2.5 },
      );
      const status = statuses[seq % statuses.length];
      const placedAt = new Date(Date.now() - day * 86400_000 + (9 + k * 3) * 3600_000);
      const cod = seq % 3 === 0;
      const order = await db.order.create({
        data: {
          orderNumber: `DX${placedAt.toISOString().slice(2, 10).replace(/-/g, "")}${String(seq).padStart(4, "0")}`,
          checkoutGroupId: `CGSEED${seq}`,
          customerId: cust.customer!.id,
          shopId: shop.id,
          status,
          paymentMethod: cod ? "COD" : "UPI",
          paymentStatus: status === "DELIVERED" ? "CAPTURED" : cod ? "PENDING" : "REFUNDED",
          addressSnapshot: { label: addr.label, name: addr.name, phone: addr.phone, line1: addr.line1, landmark: addr.landmark, city: addr.city, state: addr.state, pincode: addr.pincode },
          deliveryLat: addr.latitude,
          deliveryLng: addr.longitude,
          deliveryPincode: addr.pincode,
          contactName: addr.name,
          contactPhone: addr.phone,
          itemsMrpTotal: q.itemsMrpTotal,
          subtotal: q.subtotal,
          itemDiscount: q.itemDiscount,
          couponDiscount: 0,
          deliveryFee: q.deliveryFee,
          taxAmount: q.taxAmount,
          total: q.total,
          commissionBps,
          commissionAmount: q.commissionAmount,
          shopEarning: q.shopEarning,
          distanceKm: 2.5,
          etaMinutes: 18,
          placedAt,
          createdAt: placedAt,
          acceptedAt: status === "DELIVERED" ? new Date(placedAt.getTime() + 2 * 60_000) : null,
          packedAt: status === "DELIVERED" ? new Date(placedAt.getTime() + 9 * 60_000) : null,
          deliveredAt: status === "DELIVERED" ? new Date(placedAt.getTime() + 24 * 60_000) : null,
          cancelledAt: status !== "DELIVERED" ? new Date(placedAt.getTime() + 3 * 60_000) : null,
          rejectionReason: status === "SHOP_REJECTED" ? "Items out of stock" : null,
          cancelReason: status === "CANCELLED" ? "Ordered by mistake" : null,
          items: {
            create: chosen.map((i, idx) => ({
              inventoryId: i.id,
              productId: i.productId,
              productName: i.product.name,
              imageUrl: i.product.images[0]?.url ?? null,
              unitLabel: `${i.product.unitValue ?? ""} ${i.product.unit}`.trim(),
              quantity: lines[idx].quantity,
              mrp: i.mrp,
              unitPrice: i.sellingPrice,
              lineTotal: i.sellingPrice * lines[idx].quantity,
              taxRateBps: lines[idx].taxRateBps,
              taxAmount: q.lineTaxes[idx],
            })),
          },
          payments: {
            create: {
              provider: cod ? "COD" : "CASHFREE_MOCK",
              method: cod ? "COD" : "UPI",
              status: status === "DELIVERED" ? "CAPTURED" : cod ? "PENDING" : "REFUNDED",
              amount: q.total,
              providerOrderId: cod ? null : `order_MOCKSEED${seq}`,
              providerPaymentId: cod ? null : `pay_MOCKSEED${seq}`,
              capturedAt: status === "DELIVERED" || !cod ? placedAt : null,
            },
          },
          statusHistory: {
            create:
              status === "DELIVERED"
                ? (["SHOP_PENDING", "SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING", "PACKED", "SHIPMENT_CREATING", "SHIPMENT_CREATED", "COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"] as OrderStatus[]).map(
                    (s, i, arr) => ({ fromStatus: i === 0 ? null : arr[i - 1], toStatus: s, changedByRole: i < 5 ? "SHOP_OWNER" : "SYSTEM", createdAt: new Date(placedAt.getTime() + i * 2 * 60_000) }),
                  )
                : [
                    { fromStatus: null, toStatus: "SHOP_PENDING", changedByRole: "CUSTOMER", createdAt: placedAt },
                    { fromStatus: "SHOP_PENDING", toStatus: status, changedByRole: status === "CANCELLED" ? "CUSTOMER" : "SHOP_OWNER", createdAt: new Date(placedAt.getTime() + 3 * 60_000) },
                  ],
          },
        },
      });
      if (status === "DELIVERED") {
        await db.commission.create({
          data: { orderId: order.id, shopId: shop.id, baseAmount: q.subtotal, rateBps: commissionBps, amount: q.commissionAmount, shopEarning: q.shopEarning, createdAt: order.deliveredAt! },
        });
        await db.shipment.create({
          data: {
            orderId: order.id,
            provider: "SHIPROCKET_MOCK",
            channelOrderId: order.orderNumber,
            status: "DELIVERED",
            shiprocketOrderId: `MOCK-ORD-SEED${seq}`,
            shiprocketShipmentId: `MOCK-SHP-SEED${seq}`,
            awbCode: `MOCKAWBSEED${String(seq).padStart(5, "0")}`,
            courierCompanyId: 901,
            courierName: partner.name,
            deliveryPartnerId: partner.id,
            freightCharge: 3500,
            attempts: 1,
            createdAt: order.packedAt!,
            events: {
              create: [
                { status: "COURIER_ASSIGNED", description: "AWB assigned", source: "SYSTEM", occurredAt: order.packedAt! },
                { status: "PICKED_UP", description: "Picked up", source: "WEBHOOK", occurredAt: new Date(order.packedAt!.getTime() + 6 * 60_000) },
                { status: "DELIVERED", description: "Delivered", source: "WEBHOOK", occurredAt: order.deliveredAt! },
              ],
            },
          },
        });
      } else if (!cod) {
        const pay = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
        await db.refund.create({ data: { orderId: order.id, paymentId: pay.id, amount: q.total, reason: "Order cancelled", status: "PROCESSED", providerRefundId: `rfnd_MOCKSEED${seq}`, processedAt: order.cancelledAt } });
      }
    }
  }

  // One settled period for the first shop to show settlement history
  const old = await db.commission.findMany({ where: { shopId: shopRows[0].id, createdAt: { lt: new Date(Date.now() - 14 * 86400_000) } } });
  if (old.length) {
    const s = await db.shopSettlement.create({
      data: {
        shopId: shopRows[0].id,
        periodStart: new Date(Date.now() - 30 * 86400_000),
        periodEnd: new Date(Date.now() - 14 * 86400_000),
        orderCount: old.length,
        grossSales: old.reduce((a, c) => a + c.baseAmount, 0),
        commissionAmount: old.reduce((a, c) => a + c.amount, 0),
        netPayable: old.reduce((a, c) => a + c.shopEarning, 0),
        status: "PAID",
        reference: "UTR-SEED-000123",
        paidAt: new Date(Date.now() - 12 * 86400_000),
      },
    });
    await db.commission.updateMany({ where: { id: { in: old.map((c) => c.id) } }, data: { settlementId: s.id } });
  }

  console.log(`✔ ${PRODUCTS.length} products, ${SHOPS.length} shops, ${seq} historical orders`);
  console.log("  Admin: admin@dukaanexpress.in / Admin@12345");
  console.log("  Shop owner: ravi@dukaanexpress.in / Owner@12345 (FreshMart + Sri Ganesh)");
  console.log("  Customer: priya@example.com (or 9876543210) / Customer@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
