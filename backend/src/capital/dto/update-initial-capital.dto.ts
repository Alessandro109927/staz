import { IsNumber, Min } from 'class-validator';

export class UpdateInitialCapitalDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  initialCapital: number;
}
