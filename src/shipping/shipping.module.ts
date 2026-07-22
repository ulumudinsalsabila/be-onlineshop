import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ShippingController } from "./shipping.controller";
import { ShippingService } from "./shipping.service";

@Module({ imports: [AuthModule], controllers: [ShippingController], providers: [ShippingService], exports: [ShippingService] })
export class ShippingModule {}
