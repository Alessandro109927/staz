import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { IsNull, Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { Bet } from '../bets/entities/bet.entity';
import { Capital } from '../capital/entities/capital.entity';
import { StakingRule } from '../staking-rules/entities/staking-rule.entity';

@Injectable()
export class LegacyDataMigrationService implements OnModuleInit {
  private readonly logger = new Logger(LegacyDataMigrationService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Capital)
    private readonly capitalRepository: Repository<Capital>,
    @InjectRepository(Bet)
    private readonly betRepository: Repository<Bet>,
    @InjectRepository(StakingRule)
    private readonly stakingRuleRepository: Repository<StakingRule>,
  ) {}

  async onModuleInit() {
    const email = this.configService
      .get<string>('LEGACY_OWNER_EMAIL', 'alessandrobadagliacco10@gmail.com')
      .trim()
      .toLowerCase();

    const password = this.configService.get<string>('LEGACY_OWNER_PASSWORD');
    if (!password) {
      this.logger.warn(
        'LEGACY_OWNER_PASSWORD non impostata: migrazione dati legacy saltata',
      );
      return;
    }

    const firstName = this.configService.get<string>(
      'LEGACY_OWNER_FIRST_NAME',
      'Alessandro',
    );
    const lastName = this.configService.get<string>(
      'LEGACY_OWNER_LAST_NAME',
      'Badagliacco',
    );
    const username = this.configService.get<string>(
      'LEGACY_OWNER_USERNAME',
      'alessandro.badagliacco',
    );

    let owner = await this.userRepository.findOne({ where: { email } });

    if (!owner) {
      owner = this.userRepository.create({
        email,
        username,
        firstName,
        lastName,
        passwordHash: await bcrypt.hash(password, 10),
      });
      owner = await this.userRepository.save(owner);
      this.logger.log(`Utente legacy creato: ${owner.username} (${owner.email})`);
    }

    const [capitalUpdated, betsUpdated, rulesUpdated] = await Promise.all([
      this.capitalRepository.update({ userId: IsNull() }, { userId: owner.id }),
      this.betRepository.update({ userId: IsNull() }, { userId: owner.id }),
      this.stakingRuleRepository.update(
        { userId: IsNull() },
        { userId: owner.id },
      ),
    ]);

    const migrated =
      (capitalUpdated.affected ?? 0) +
      (betsUpdated.affected ?? 0) +
      (rulesUpdated.affected ?? 0);

    if (migrated > 0) {
      this.logger.log(
        `Dati legacy assegnati a ${owner.username}: ` +
          `${capitalUpdated.affected ?? 0} capitale, ` +
          `${betsUpdated.affected ?? 0} scommesse, ` +
          `${rulesUpdated.affected ?? 0} regole stake`,
      );
    }
  }
}
