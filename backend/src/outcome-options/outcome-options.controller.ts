import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user';
import {
  CreateOutcomeOptionDto,
  UpdateOutcomeOptionDto,
} from './dto/outcome-option.dto';
import { ImportOutcomeOptionsDto } from './dto/import-outcome-options.dto';
import { OutcomeOptionsService } from './outcome-options.service';

@Controller('outcome-options')
@UseGuards(JwtAuthGuard)
export class OutcomeOptionsController {
  constructor(private readonly outcomeOptionsService: OutcomeOptionsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.outcomeOptionsService.findAll(user.userId);
  }

  @Get('export')
  @Header('Content-Type', 'application/json; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="outcome-catalog.json"')
  exportCatalog(@CurrentUser() user: AuthUser) {
    return this.outcomeOptionsService.exportCatalog(user.userId);
  }

  @Post('import')
  importFromJson(
    @CurrentUser() user: AuthUser,
    @Body() dto: ImportOutcomeOptionsDto,
  ) {
    return this.outcomeOptionsService.importCatalog(
      user.userId,
      dto.items,
      dto.replace ?? false,
    );
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOutcomeOptionDto) {
    return this.outcomeOptionsService.create(user.userId, dto);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOutcomeOptionDto,
  ) {
    return this.outcomeOptionsService.update(user.userId, Number(id), dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.outcomeOptionsService.remove(user.userId, Number(id));
  }
}
