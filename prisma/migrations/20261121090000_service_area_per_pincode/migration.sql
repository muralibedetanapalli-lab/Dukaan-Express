-- A city can now hold several service areas (e.g. one per dealer pincode).
DROP INDEX "ServiceArea_city_state_key";

-- CreateIndex
CREATE INDEX "ServiceArea_city_state_idx" ON "ServiceArea"("city", "state");
