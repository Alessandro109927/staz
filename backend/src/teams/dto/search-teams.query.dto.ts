import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import type { TeamSearchKind } from '../national-team.util';

export class SearchTeamsQueryDto {
  @IsString()
  @MinLength(2)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;

  /** Default `all`: club e nazionali; filtri opzionali */
  @IsOptional()
  @IsIn(['club', 'national', 'all'])
  type?: TeamSearchKind;
}
