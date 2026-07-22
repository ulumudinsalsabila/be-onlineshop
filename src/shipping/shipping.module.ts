import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BiteshipService } from "./biteship.service";
import { ShippingController } from "./shipping.controller";

@Module({ imports: [AuthModule], controllers: [ShippingController], providers: [BiteshipService], exports: [BiteshipService] })
export class ShippingModule {}
