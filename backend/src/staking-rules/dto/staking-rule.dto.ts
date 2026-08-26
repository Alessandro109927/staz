import { IsNumber, IsOptional, Min } from 'class-validator';

export class CreateStakingRuleDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  minOdds: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  maxOdds?: number | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  stakePercentage: number;
}

export class UpdateStakingRuleDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  minOdds?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  maxOdds?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  stakePercentage?: number;
}
