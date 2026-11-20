/** How a shop's orders reach the customer. Shared by server and client code. */
export const DELIVERY_MODES = ["RIDER", "OWN", "SELF_BOOKED"] as const;
export type DeliveryModeKey = (typeof DELIVERY_MODES)[number];

/** The shop (not a Dukaan Express rider) sends the order out and confirms the handover. */
export const shopDelivers = (mode: string | null | undefined) => mode === "OWN" || mode === "SELF_BOOKED";

/** The customer is never charged a delivery fee: the shop pays the delivery app itself. */
export const noDeliveryFee = (mode: string | null | undefined) => mode === "SELF_BOOKED";
