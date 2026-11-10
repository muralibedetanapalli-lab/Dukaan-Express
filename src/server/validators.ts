import { z } from "zod";
import { zPhone, zPincode } from "./http";

export const zAddress = z.object({
  label: z.string().trim().min(1).max(30).default("Home"),
  name: z.string().trim().min(2).max(80),
  phone: zPhone,
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  landmark: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  pincode: zPincode,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isDefault: z.boolean().default(false),
});

export const zDateRange = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
