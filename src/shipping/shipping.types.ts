export type ShippingDestination = {
  id: number;
  label: string;
  province: string;
  city: string;
  district: string;
  subdistrict: string;
  postalCode: string;
};

export type ShippingRate = {
  provider: "rajaongkir";
  courierCode: string;
  courierName: string;
  serviceCode: string;
  serviceName: string;
  description: string;
  cost: number;
  etd: string;
  estimateLabel: string;
  estimateMinDays: number | null;
  estimateMaxDays: number | null;
};

export type ShippingQuote = {
  cartId: string;
  originId: number;
  destinationId: number;
  weightGrams: number;
  rates: ShippingRate[];
};
