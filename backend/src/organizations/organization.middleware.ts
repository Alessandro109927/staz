import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { parseOrganizationSlug } from './organization.constants';
import { runWithOrganization } from './organization-context';
import { OrganizationsService } from './organizations.service';

@Injectable()
export class OrganizationMiddleware implements NestMiddleware {
  constructor(private readonly organizations: OrganizationsService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const slug = parseOrganizationSlug(req.header('x-organization'));
    const organization = this.organizations.getBySlug(slug);
    runWithOrganization({ id: organization.id, slug }, () => next());
  }
}
