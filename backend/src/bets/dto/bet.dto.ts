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
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BetStatus } from '../../common/enums/bet-status.enum';

export class BetEventItemDto {
  @IsString()
  @MinLength(1)
  eventName: string;

  @IsString()
  @MinLength(1)
  outcome: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1.01)
  odds: number;
}

export class CalculateStakeDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BetEventItemDto)
  events: BetEventItemDto[];
}

export class CreateBetDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BetEventItemDto)
  events: BetEventItemDto[];

  @IsDateString()
  betDate: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  stakePercentageApplied?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amountStaked?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  potentialWin?: number;
}

export class SettleBetDto {
  @IsIn([BetStatus.WON, BetStatus.LOST])
  status: BetStatus.WON | BetStatus.LOST;
}

export class UpdateBetDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BetEventItemDto)
  events: BetEventItemDto[];

  @IsDateString()
  betDate: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  stakePercentageApplied?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amountStaked?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  potentialWin?: number;

  @IsEnum(BetStatus)
  status: BetStatus;
}

export class ListBetsQueryDto {
  @IsOptional()
  @IsEnum(BetStatus)
  status?: BetStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
