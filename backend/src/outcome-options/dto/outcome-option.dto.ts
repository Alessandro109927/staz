import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const OUTCOME_OPTION_KINDS = ['standard', 'scorer'] as const;
export type OutcomeOptionKind = (typeof OUTCOME_OPTION_KINDS)[number];

export class CreateOutcomeOptionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @IsIn(['standard', 'scorer'])
  kind?: OutcomeOptionKind;
}

export class UpdateOutcomeOptionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @IsIn(['standard', 'scorer'])
  kind?: OutcomeOptionKind;
}
