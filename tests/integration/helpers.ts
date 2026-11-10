import { db } from "@/server/db";
import { invalidateSettingsCache } from "@/server/services/settings";
import { resetRateLimits } from "@/server/rate-limit";

export async function resetDb() {
  const rows = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  invalidateSettingsCache();
  resetRateLimits();
}

const allDay = Array.from({ length: 7 }, (_, d) => ({ dayOfWeek: d, openTime: "00:00", closeTime: "23:59", isClosed: false }));

/** A shop in Koramangala, a nearby customer, and two products (one with low stock). */
export async function fixture(opts: { deliveryPincode?: string; stock?: number } = {}) {
  const cat = await db.category.create({ data: { name: "Groceries", slug: `groceries-${Math.random().toString(36).slice(2, 7)}`, taxRateBps: 500 } });
  const ownerUser = await db.user.create({
    data: { role: "SHOP_OWNER", name: "Owner", email: `owner-${Date.now()}@t.in`, phone: "9845000001", passwordHash: "x", shopOwner: { create: {} } },
    include: { shopOwner: true },
  });
  const shop = await db.shop.create({
    data: {
      name: "Test Mart",
      slug: `test-mart-${Math.random().toString(36).slice(2, 7)}`,
      ownerId: ownerUser.shopOwner!.id,
      contactPhone: "9845000002",
      approvalStatus: "APPROVED",
      isActive: true,
      deliveryRadiusKm: 6,
      commissionBps: 1000,
      address: { create: { line1: "80 Feet Road, Koramangala", city: "Bengaluru", state: "Karnataka", pincode: "560034", latitude: 12.9352, longitude: 77.6245 } },
      hours: { create: allDay },
    },
  });
  const [p1, p2] = await Promise.all([
    db.product.create({ data: { name: "Atta 5kg", slug: `atta-${Math.random().toString(36).slice(2, 7)}`, categoryId: cat.id, weightGrams: 5000 } }),
    db.product.create({ data: { name: "Ghee 500ml", slug: `ghee-${Math.random().toString(36).slice(2, 7)}`, categoryId: cat.id, weightGrams: 500 } }),
  ]);
  const inv1 = await db.shopInventory.create({ data: { shopId: shop.id, productId: p1.id, mrp: 30000, sellingPrice: 27000, stock: opts.stock ?? 20 } });
  const inv2 = await db.shopInventory.create({ data: { shopId: shop.id, productId: p2.id, mrp: 36000, sellingPrice: 34000, stock: 1, lowStockThreshold: 2 } });

  const custUser = await db.user.create({
    data: {
      role: "CUSTOMER",
      name: "Priya",
      phone: "9876500000",
      customer: {
        create: {
          cart: { create: {} },
          addresses: {
            create: {
              name: "Priya",
              phone: "9876500000",
              line1: "Flat 1, 20th Main",
              city: "Bengaluru",
              state: "Karnataka",
              pincode: opts.deliveryPincode ?? "560034",
              latitude: 12.9339,
              longitude: 77.6229,
              isDefault: true,
            },
          },
        },
      },
    },
    include: { customer: { include: { addresses: true } } },
  });
  const admin = await db.user.create({ data: { role: "SUPER_ADMIN", name: "Admin", email: `admin-${Date.now()}@t.in`, passwordHash: "x" } });

  return {
    shop,
    inv1,
    inv2,
    owner: { id: ownerUser.id, role: "SHOP_OWNER" as const, shopOwnerId: ownerUser.shopOwner!.id },
    customer: { userId: custUser.id, customerId: custUser.customer!.id, addressId: custUser.customer!.addresses[0].id },
    customerActor: { id: custUser.id, role: "CUSTOMER" as const, customerId: custUser.customer!.id },
    admin: { id: admin.id, role: "SUPER_ADMIN" as const },
  };
}
