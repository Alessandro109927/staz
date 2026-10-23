import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { BetfairPaperService } from './betfair-paper.service';

@Controller('betfair-paper')
@UseGuards(JwtAuthGuard)
export class BetfairPaperController {
  constructor(private readonly paper: BetfairPaperService) {}

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.paper.statusForCurrentUser(user.userId);
  }
}
