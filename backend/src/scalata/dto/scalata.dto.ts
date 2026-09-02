import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { BetStatus } from '../../common/enums/bet-status.enum';
import { ScalataRunStatus } from '../../common/enums/scalata-run-status.enum';
import { BetEventItemDto } from '../../bets/dto/bet.dto';

export class CreateScalataDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  startBankroll: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  targetProfit: number;

  @IsIn(['auto', 'manual'])
  daysMode: 'auto' | 'manual';

  @IsNumber()
  @Min(1)
  @Max(90)
  days: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1.01)
  maxDailyOdds: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1.01)
  minDailyOdds: number;

  @IsIn(['uniform', 'decreasing'])
  oddsStrategy: 'uniform' | 'decreasing';
}

export class ListScalataQueryDto {
  @IsOptional()
  @IsEnum(ScalataRunStatus)
  status?: ScalataRunStatus;
}

export class SubmitScalataStepDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BetEventItemDto)
  events: BetEventItemDto[];

  @IsDateString()
  betDate: string;

  @IsEnum(BetStatus)
  status: BetStatus;
}

export class AbandonScalataDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
