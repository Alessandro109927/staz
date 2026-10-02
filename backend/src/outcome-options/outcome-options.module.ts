import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { OutcomeOption } from './entities/outcome-option.entity';
import { OutcomeOptionsController } from './outcome-options.controller';
import { OutcomeOptionsService } from './outcome-options.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OutcomeOption]),
    forwardRef(() => AuthModule),
  ],
  controllers: [OutcomeOptionsController],
  providers: [OutcomeOptionsService],
  exports: [OutcomeOptionsService],
})
export class OutcomeOptionsModule {}
