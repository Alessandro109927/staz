import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutcomeOption } from '../outcome-options/entities/outcome-option.entity';
import { StakingRule } from '../staking-rules/entities/staking-rule.entity';
import { Organization } from './entities/organization.entity';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [TypeOrmModule.forFeature([Organization, StakingRule, OutcomeOption])],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
