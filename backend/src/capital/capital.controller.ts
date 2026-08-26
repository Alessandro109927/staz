import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { CapitalService } from './capital.service';
import { SetCapitalDto } from './dto/set-capital.dto';
import { UpdateInitialCapitalDto } from './dto/update-initial-capital.dto';

@Controller('capital')
export class CapitalController {
  constructor(private readonly capitalService: CapitalService) {}

  @Get()
  getCapital() {
    return this.capitalService.getCapital();
  }

  @Post()
  setCapital(@Body() dto: SetCapitalDto) {
    return this.capitalService.setCapital(dto);
  }

  @Patch('initial')
  updateInitialCapital(@Body() dto: UpdateInitialCapitalDto) {
    return this.capitalService.updateInitialCapital(dto.initialCapital);
  }
}
