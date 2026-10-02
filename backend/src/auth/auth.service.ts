import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { OutcomeOptionsService } from '../outcome-options/outcome-options.service';
import { StakingRulesService } from '../staking-rules/staking-rules.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User } from './entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => StakingRulesService))
    private readonly stakingRulesService: StakingRulesService,
    @Inject(forwardRef(() => OutcomeOptionsService))
    private readonly outcomeOptionsService: OutcomeOptionsService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existingEmail = await this.userRepository.findOne({
      where: { email },
    });
    if (existingEmail) {
      throw new ConflictException('Email già registrata');
    }

    const username = await this.generateUsername(
      dto.firstName,
      dto.lastName,
      email,
    );
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = this.userRepository.create({
      username,
      email,
      passwordHash,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
    });

    const saved = await this.userRepository.save(user);
    await this.stakingRulesService.seedDefaults(saved.id);
    await this.outcomeOptionsService.importDefaultCatalog(saved.id, true);
    return this.buildAuthResponse(saved);
  }

  async login(dto: LoginDto) {
    const identifier = dto.username.trim().toLowerCase();
    const user = await this.userRepository.findOne({
      where: [{ username: identifier }, { email: identifier }],
    });

    if (!user) {
      throw new UnauthorizedException('Credenziali non valide');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Credenziali non valide');
    }

    return this.buildAuthResponse(user);
  }

  async getProfile(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Utente non trovato');
    }
    return this.mapUser(user);
  }

  private buildAuthResponse(user: User) {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      username: user.username,
    });

    return {
      accessToken,
      user: this.mapUser(user),
    };
  }

  private mapUser(user: User) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  private async generateUsername(
    firstName: string,
    lastName: string,
    email: string,
  ): Promise<string> {
    const sanitize = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '');

    const baseFromName = sanitize(`${firstName}.${lastName}`);
    const baseFromEmail = sanitize(email.split('@')[0] ?? 'user');
    const base = baseFromName || baseFromEmail || 'user';

    let candidate = base;
    let suffix = 1;

    while (
      await this.userRepository.findOne({ where: { username: candidate } })
    ) {
      candidate = `${base}${suffix}`;
      suffix += 1;
    }

    return candidate;
  }
}
