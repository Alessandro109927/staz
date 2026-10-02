import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SearchTeamsQueryDto } from './dto/search-teams.query.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get('search')
  search(@Query() query: SearchTeamsQueryDto) {
    const limit = query.limit ?? 12;
    const kind = query.type ?? 'all';
    return this.teamsService.searchTeams(query.q, limit, kind);
  }
}
