export type TrackingEvent = { status: string; note: string; occurredAt: Date };

export function buildTrackingEvents(input: {
  orderCreatedAt: Date;
  paidAt?: Date | null;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
}): TrackingEvent[] {
  const events: TrackingEvent[] = [{ status: "ORDER_PLACED", note: "The order has been placed.", occurredAt: input.orderCreatedAt }];
  if (input.paidAt) events.push({ status: "PAYMENT_CONFIRMED", note: "Payment has been confirmed.", occurredAt: input.paidAt });
  if (input.shippedAt) events.push({ status: "SHIPPED", note: "The order has been handed to the courier.", occurredAt: input.shippedAt });
  if (input.deliveredAt) events.push({ status: "DELIVERED", note: "The order has been delivered.", occurredAt: input.deliveredAt });
  return events.sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
}
