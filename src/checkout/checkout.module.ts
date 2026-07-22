import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CheckoutController } from "./checkout.controller";
import { CheckoutService } from "./checkout.service";
import { MidtransService } from "./midtrans.service";
import { PaymentsController } from "./payments.controller";
@Module({ imports: [AuthModule], controllers: [CheckoutController, PaymentsController], providers: [CheckoutService, MidtransService] })
export class CheckoutModule {}
