-- Welcome email with login details for shop owners, dealers and riders.
ALTER TABLE "User" ADD COLUMN "welcomeSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "welcomeSentAt" TIMESTAMP(3);

-- Existing staff already have their logins: don't send them a welcome now.
UPDATE "User" SET "welcomeSentAt" = "createdAt" WHERE "role" IN ('SHOP_OWNER', 'DEALER', 'RIDER');
