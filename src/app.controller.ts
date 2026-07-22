import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

@ApiTags("System")
@Controller()
export class AppController {
  @ApiOperation({ summary: "Check API health" })
  @Get("health")
  health() {
    return { success: true, data: { status: "ok", service: "toko-online-backend" } };
  }
}
