import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get("health")
  health() {
    return { success: true, data: { status: "ok", service: "toko-online-backend" } };
  }
}
