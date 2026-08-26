import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class SetCapitalDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  initialCapital: number;

  @IsOptional()
  @IsBoolean()
  reset?: boolean;
}
