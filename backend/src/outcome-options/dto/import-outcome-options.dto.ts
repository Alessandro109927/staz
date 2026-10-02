import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { OUTCOME_OPTION_KINDS } from './outcome-option.dto';

export class ImportOutcomeOptionItemDto {
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
  @IsIn([...OUTCOME_OPTION_KINDS])
  kind?: (typeof OUTCOME_OPTION_KINDS)[number];
}

export class ImportOutcomeOptionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportOutcomeOptionItemDto)
  items!: ImportOutcomeOptionItemDto[];

  @IsOptional()
  @IsBoolean()
  replace?: boolean;
}
