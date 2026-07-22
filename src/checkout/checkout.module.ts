import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CheckoutController } from "./checkout.controller";
import { CheckoutService } from "./checkout.service";
import { MidtransService } from "./midtrans.service";
import { PaymentsController } from "./payments.controller";
import { ShippingModule } from "../shipping/shipping.module";
@Module({ imports: [AuthModule, ShippingModule], controllers: [CheckoutController, PaymentsController], providers: [CheckoutService, MidtransService] })
export class CheckoutModule {}
