import { IsIn, IsOptional, ValidateIf } from 'class-validator';
import { BetStatus } from '../../common/enums/bet-status.enum';

export class UpdateEventResultDto {
  @IsOptional()
  @ValidateIf((_obj, value) => value != null)
  @IsIn([BetStatus.WON, BetStatus.LOST])
  result: BetStatus.WON | BetStatus.LOST | null;
}
