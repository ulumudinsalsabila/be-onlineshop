import { Module } from "@nestjs/common";

import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { CommerceModule } from "./commerce/commerce.module";
import { PrismaModule } from "./common/prisma.module";
import { ProductsModule } from "./products/products.module";
import { AccountModule } from "./account/account.module";
import { CheckoutModule } from "./checkout/checkout.module";
import { SellerModule } from "./seller/seller.module";
import { AdminModule } from "./admin/admin.module";
import { RegionsModule } from "./regions/regions.module";

@Module({
  imports: [PrismaModule, AuthModule, ProductsModule, CommerceModule, AccountModule, CheckoutModule, SellerModule, AdminModule, RegionsModule],
  controllers: [AppController],
})
export class AppModule {}
