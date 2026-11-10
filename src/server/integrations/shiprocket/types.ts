export interface CourierOption {
  courierCompanyId: number;
  courierName: string;
  rate: number; // paise
  etd: string | null; // human readable estimated delivery date
  etdHours: number | null;
  rating: number | null;
  isSurface: boolean;
  recommended: boolean;
}

export interface ServiceabilityInput {
  pickupPincode: string;
  deliveryPincode: string;
  weightKg: number;
  cod: boolean;
  declaredValue: number; // rupees
  pickupLat?: number;
  pickupLng?: number;
  deliveryLat?: number;
  deliveryLng?: number;
}

export interface CreateOrderInput {
  channelOrderId: string;
  orderDate: Date;
  pickupLocation: string;
  customer: { name: string; phone: string; email?: string | null };
  address: { line1: string; line2?: string | null; city: string; state: string; pincode: string };
  items: { name: string; sku: string; units: number; sellingPrice: number /* rupees */; tax?: number }[];
  paymentMethod: "Prepaid" | "COD";
  subTotal: number; // rupees
  dimensions: { lengthCm: number; breadthCm: number; heightCm: number; weightKg: number };
}

export interface CreatedOrder {
  shiprocketOrderId: string;
  shipmentId: string;
}

export interface AwbResult {
  awbCode: string;
  courierCompanyId: number;
  courierName: string;
}

export interface TrackingActivity {
  occurredAt: Date;
  status: string;
  activity: string;
  location: string | null;
}

export interface TrackingResult {
  currentStatus: string;
  etd: string | null;
  trackUrl: string | null;
  activities: TrackingActivity[];
}

export interface PickupLocationInput {
  nickname: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  address2?: string | null;
  city: string;
  state: string;
  pincode: string;
  lat?: number;
  lng?: number;
}

export interface ShippingProvider {
  readonly name: "SHIPROCKET" | "SHIPROCKET_MOCK";
  checkServiceability(input: ServiceabilityInput): Promise<CourierOption[]>;
  findOrderByChannelId(channelOrderId: string): Promise<(CreatedOrder & { awbCode: string | null }) | null>;
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  assignAwb(shipmentId: string, courierCompanyId: number): Promise<AwbResult>;
  schedulePickup(shipmentId: string): Promise<{ scheduledAt: Date | null; token: string | null }>;
  generateLabel(shipmentId: string): Promise<{ labelUrl: string | null }>;
  track(awbCode: string): Promise<TrackingResult>;
  cancelOrder(shiprocketOrderId: string): Promise<void>;
  addPickupLocation(input: PickupLocationInput): Promise<{ nickname: string }>;
}

export class ShiprocketError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly body: unknown,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ShiprocketError";
  }
}
