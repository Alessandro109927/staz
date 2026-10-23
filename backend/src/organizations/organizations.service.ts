import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { OutcomeOption } from '../outcome-options/entities/outcome-option.entity';
import { DEFAULT_STAKING_RULES } from '../staking-rules/staking-rules.service';
import { StakingRule } from '../staking-rules/entities/staking-rule.entity';
import {
  ORG_BET365,
  ORG_BETFAIR,
  ORGANIZATION_DEFINITIONS,
  OrganizationSlug,
} from './organization.constants';
import { currentOrganization } from './organization-context';
import { Organization } from './entities/organization.entity';

@Injectable()
export class OrganizationsService implements OnModuleInit {
  private readonly logger = new Logger(OrganizationsService.name);
  private readonly bySlug = new Map<OrganizationSlug, Organization>();

  constructor(
    @InjectRepository(Organization)
    private readonly organizations: Repository<Organization>,
    @InjectRepository(StakingRule)
    private readonly stakingRules: Repository<StakingRule>,
    @InjectRepository(OutcomeOption)
    private readonly outcomeOptions: Repository<OutcomeOption>,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const definition of ORGANIZATION_DEFINITIONS) {
      let row = await this.organizations.findOne({
        where: { slug: definition.slug },
      });
      if (!row) {
        row = await this.organizations.save(
          this.organizations.create({
            slug: definition.slug,
            name: definition.name,
          }),
        );
        this.logger.log(`Organizzazione creata: ${row.name}`);
      }
      this.bySlug.set(definition.slug, row);
    }

    await this.dropLegacyCapitalUserUnique();
  }

  getBySlug(slug: OrganizationSlug): Organization {
    const organization = this.bySlug.get(slug);
    if (!organization) {
      throw new Error(`Organizzazione ${slug} non inizializzata`);
    }
    return organization;
  }

  /**
   * Prepara Betfair con copie nuove di regole e esiti.
   * Non aggiorna le righe bet365.
   */
  async provisionWorkspace(userId: number): Promise<void> {
    if (currentOrganization().slug !== ORG_BETFAIR) {
      return;
    }

    const betfairId = this.getBySlug(ORG_BETFAIR).id;
    const bet365Id = this.getBySlug(ORG_BET365).id;

    const ruleCount = await this.stakingRules.count({
      where: { userId, organizationId: betfairId },
    });
    if (ruleCount === 0) {
      const sourceRules = await this.stakingRules.find({
        where: [
          { userId, organizationId: bet365Id },
          { userId, organizationId: IsNull() },
        ],
        order: { minOdds: 'ASC' },
      });
      const templates = sourceRules.length
        ? sourceRules.map((rule) => ({
            minOdds: rule.minOdds,
            maxOdds: rule.maxOdds,
            stakePercentage: rule.stakePercentage,
          }))
        : DEFAULT_STAKING_RULES;

      await this.stakingRules.save(
        templates.map((rule) =>
          this.stakingRules.create({
            userId,
            organizationId: betfairId,
            ...rule,
          }),
        ),
      );
    }

    const outcomeCount = await this.outcomeOptions.count({
      where: { userId, organizationId: betfairId },
    });
    if (outcomeCount === 0) {
      const sourceOutcomes = await this.outcomeOptions.find({
        where: [
          { userId, organizationId: bet365Id },
          { userId, organizationId: IsNull() },
        ],
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
      if (sourceOutcomes.length) {
        await this.outcomeOptions.save(
          sourceOutcomes.map((row) =>
            this.outcomeOptions.create({
              userId,
              organizationId: betfairId,
              label: row.label,
              description: row.description,
              sortOrder: row.sortOrder,
              kind: row.kind,
            }),
          ),
        );
      }
    }
  }

  private async dropLegacyCapitalUserUnique(): Promise<void> {
    await this.organizations.manager.query(`
      DO $$
      DECLARE
        constraint_name text;
      BEGIN
        FOR constraint_name IN
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_attribute a
            ON a.attrelid = t.oid
           AND a.attnum = ANY (c.conkey)
          WHERE t.relname = 'capital'
            AND c.contype = 'u'
            AND array_length(c.conkey, 1) = 1
            AND a.attname = 'user_id'
        LOOP
          EXECUTE format('ALTER TABLE capital DROP CONSTRAINT %I', constraint_name);
        END LOOP;
      END $$;
    `);
    await this.organizations.manager.query(`
      DO $$
      DECLARE
        index_name text;
      BEGIN
        FOR index_name IN
          SELECT i.relname
          FROM pg_index ix
          JOIN pg_class t ON t.oid = ix.indrelid
          JOIN pg_class i ON i.oid = ix.indexrelid
          JOIN pg_attribute a
            ON a.attrelid = t.oid
           AND a.attnum = ix.indkey[0]
          WHERE t.relname = 'capital'
            AND ix.indisunique
            AND ix.indnkeyatts = 1
            AND a.attname = 'user_id'
        LOOP
          EXECUTE format('DROP INDEX IF EXISTS %I', index_name);
        END LOOP;
      END $$;
    `);
  }
}
