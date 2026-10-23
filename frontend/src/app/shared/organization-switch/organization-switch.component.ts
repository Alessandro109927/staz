import { Component, ElementRef, HostListener, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  OrganizationService,
  OrganizationSlug,
} from '../../core/services/organization.service';

@Component({
  selector: 'app-organization-switch',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './organization-switch.component.html',
  styleUrl: './organization-switch.component.scss',
})
export class OrganizationSwitchComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly organizations = inject(OrganizationService);

  open = false;
  readonly options = this.organizations.options;

  get currentLabel(): string {
    return this.organizations.label();
  }

  toggle(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.open = !this.open;
  }

  choose(slug: OrganizationSlug): void {
    this.open = false;
    this.organizations.select(slug);
  }

  @HostListener('document:click', ['$event'])
  closeOnOutside(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.open = false;
    }
  }
}
