import { Module } from "@nestjs/common";

import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { CommerceModule } from "./commerce/commerce.module";
import { PrismaModule } from "./common/prisma.module";
import { ProductsModule } from "./products/products.module";

@Module({
  imports: [PrismaModule, AuthModule, ProductsModule, CommerceModule],
  controllers: [AppController],
})
export class AppModule {}
