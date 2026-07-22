export type TrackingEvent = { status: string; note: string; occurredAt: Date };

export function buildTrackingEvents(input: {
  orderCreatedAt: Date;
  paidAt?: Date | null;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
}): TrackingEvent[] {
  const events: TrackingEvent[] = [{ status: "ORDER_PLACED", note: "Pesanan telah dibuat.", occurredAt: input.orderCreatedAt }];
  if (input.paidAt) events.push({ status: "PAYMENT_CONFIRMED", note: "Pembayaran telah dikonfirmasi.", occurredAt: input.paidAt });
  if (input.shippedAt) events.push({ status: "SHIPPED", note: "Pesanan telah diserahkan kepada kurir.", occurredAt: input.shippedAt });
  if (input.deliveredAt) events.push({ status: "DELIVERED", note: "Pesanan telah diterima.", occurredAt: input.deliveredAt });
  return events.sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
}
