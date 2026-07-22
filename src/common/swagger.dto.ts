import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class LoginRequestDto {
  @ApiProperty({ format: "email", example: "customer@example.test" }) email!: string;
  @ApiProperty({ format: "password", example: "Password123" }) password!: string;
}

export class RegisterRequestDto {
  @ApiProperty({ example: "IVORY Customer" }) name!: string;
  @ApiProperty({ format: "email", example: "customer@example.test" }) email!: string;
  @ApiProperty({ format: "password", minLength: 10, example: "Password123" }) password!: string;
  @ApiProperty({ format: "password", example: "Password123" }) confirmPassword!: string;
}

export class EmailRequestDto {
  @ApiProperty({ format: "email", example: "customer@example.test" }) email!: string;
}

export class ResetPasswordRequestDto extends EmailRequestDto {
  @ApiProperty({ minLength: 20 }) token!: string;
  @ApiProperty({ format: "password", minLength: 10 }) password!: string;
  @ApiProperty({ format: "password", minLength: 10 }) confirmPassword!: string;
}

export class AddCartItemRequestDto {
  @ApiProperty({ description: "CUID product variant" }) variantId!: string;
  @ApiProperty({ minimum: 1, maximum: 20, default: 1 }) quantity!: number;
}

export class UpdateCartItemRequestDto {
  @ApiProperty({ minimum: 1, maximum: 20 }) quantity!: number;
}

export class WishlistRequestDto {
  @ApiProperty({ description: "CUID product" }) productId!: string;
}

export class UpdateProfileRequestDto {
  @ApiProperty({ minLength: 2, maxLength: 80 }) name!: string;
  @ApiPropertyOptional({ maxLength: 20 }) phone?: string;
}

export class UpdatePasswordRequestDto {
  @ApiProperty({ format: "password" }) currentPassword!: string;
  @ApiProperty({ format: "password", minLength: 10 }) newPassword!: string;
  @ApiProperty({ format: "password", minLength: 10 }) confirmPassword!: string;
}

export class AddressRequestDto {
  @ApiProperty({ example: "Home" }) label!: string;
  @ApiProperty({ example: "IVORY Customer" }) recipient!: string;
  @ApiProperty({ example: "081234567890" }) phone!: string;
  @ApiProperty({ example: "Jl. Sudirman No. 1" }) line1!: string;
  @ApiPropertyOptional() line2?: string;
  @ApiProperty({ example: "31" }) provinceCode!: string;
  @ApiProperty({ example: "31.71" }) regencyCode!: string;
  @ApiProperty({ example: "31.71.07" }) districtCode!: string;
  @ApiProperty({ example: "31.71.07.1002" }) villageCode!: string;
  @ApiProperty({ pattern: "^\\d{5}$", example: "10220" }) postalCode!: string;
  @ApiProperty({ default: "Indonesia" }) country!: string;
  @ApiProperty({ default: false }) isDefault!: boolean;
}

export class ShippingRatesRequestDto {
  @ApiProperty({ example: 501 }) destinationId!: number;
  @ApiProperty({ example: "cmcart123456789" }) cartId!: string;
}

export class CheckoutAddressDto {
  @ApiProperty() recipient!: string;
  @ApiProperty() phone!: string;
  @ApiProperty() line1!: string;
  @ApiPropertyOptional() line2?: string;
  @ApiProperty() district!: string;
  @ApiProperty() city!: string;
  @ApiProperty() province!: string;
  @ApiProperty({ pattern: "^\\d{5}$" }) postalCode!: string;
  @ApiProperty({ default: "Indonesia" }) country!: string;
}

export class ShippingSelectionDto {
  @ApiProperty({ example: 501 }) destinationId!: number;
  @ApiProperty({ example: "jne" }) courierCode!: string;
  @ApiProperty({ example: "REG" }) serviceCode!: string;
}

export class CheckoutRequestDto {
  @ApiPropertyOptional({ description: "Existing address CUID; required when address is omitted" }) addressId?: string;
  @ApiPropertyOptional({ type: CheckoutAddressDto, description: "Inline address; required when addressId is omitted" }) address?: CheckoutAddressDto;
  @ApiProperty({ type: ShippingSelectionDto }) shipping!: ShippingSelectionDto;
  @ApiPropertyOptional() voucherCode?: string;
  @ApiProperty({ enum: ["BANK_TRANSFER", "CREDIT_CARD", "E_WALLET", "VIRTUAL_ACCOUNT"] }) paymentMethod!: string;
  @ApiPropertyOptional({ maxLength: 500 }) notes?: string;
}

export class SellerApplicationRequestDto {
  @ApiProperty({ maxLength: 100 }) displayName!: string;
  @ApiProperty({ minLength: 8, maxLength: 20 }) phone!: string;
  @ApiPropertyOptional({ maxLength: 40 }) identityNumber?: string;
  @ApiPropertyOptional({ maxLength: 1500 }) bio?: string;
  @ApiProperty({ maxLength: 2000 }) applicationNote!: string;
  @ApiProperty({ maxLength: 80 }) bankName!: string;
  @ApiProperty({ maxLength: 100 }) bankAccountName!: string;
  @ApiProperty({ pattern: "^\\d{6,30}$" }) bankAccountNumber!: string;
}

export class SellerProfileRequestDto {
  @ApiProperty({ maxLength: 100 }) displayName!: string;
  @ApiProperty({ minLength: 8, maxLength: 20 }) phone!: string;
  @ApiPropertyOptional({ maxLength: 1500 }) bio?: string;
  @ApiProperty({ maxLength: 80 }) bankName!: string;
  @ApiProperty({ maxLength: 100 }) bankAccountName!: string;
  @ApiProperty({ pattern: "^\\d{6,30}$" }) bankAccountNumber!: string;
}

export class SubmissionRequestDto {
  @ApiProperty({ maxLength: 160 }) title!: string;
  @ApiPropertyOptional() brandId?: string;
  @ApiPropertyOptional({ maxLength: 100 }) proposedBrand?: string;
  @ApiProperty() categoryId!: string;
  @ApiProperty({ enum: ["PRISTINE", "EXCELLENT", "VERY_GOOD", "GOOD"] }) conditionLabel!: string;
  @ApiProperty({ maxLength: 500 }) completeness!: string;
  @ApiPropertyOptional({ maxLength: 2000 }) flawNotes?: string;
  @ApiProperty({ maxLength: 5000 }) description!: string;
  @ApiProperty({ minimum: 100000, maximum: 10000000000 }) expectedPrice!: number;
}

export class SubmissionTransitionRequestDto {
  @ApiProperty({ enum: ["SUBMITTED", "WAITING_FOR_ITEM", "CANCELLED"] }) status!: string;
  @ApiPropertyOptional({ enum: ["ACCEPTED", "REJECTED"] }) decision?: string;
  @ApiPropertyOptional({ maxLength: 1000 }) reason?: string;
}

export class PayoutRequestDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 100 }) commissionIds!: string[];
}
