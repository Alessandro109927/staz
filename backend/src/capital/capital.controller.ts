import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { CapitalService } from './capital.service';
import { SetCapitalDto } from './dto/set-capital.dto';
import { UpdateInitialCapitalDto } from './dto/update-initial-capital.dto';

@Controller('capital')
@UseGuards(JwtAuthGuard)
export class CapitalController {
  constructor(private readonly capitalService: CapitalService) {}

  @Get()
  getCapital(@CurrentUser() user: AuthUser) {
    return this.capitalService.getCapital(user.userId);
  }

  @Post()
  setCapital(@CurrentUser() user: AuthUser, @Body() dto: SetCapitalDto) {
    return this.capitalService.setCapital(user.userId, dto);
  }

  @Patch('initial')
  updateInitialCapital(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateInitialCapitalDto,
  ) {
    return this.capitalService.updateInitialCapital(user.userId, dto.initialCapital);
  }
}
