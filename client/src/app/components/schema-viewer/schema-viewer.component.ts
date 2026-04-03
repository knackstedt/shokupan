import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'skp-schema-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './schema-viewer.component.html',
  styleUrl: './schema-viewer.component.scss',
})
export class SchemaViewerComponent {
  @Input() schema: any;
  @Input() depth: number = 0;

  get indent(): number {
    return this.depth * 16;
  }

  get type(): string {
    return this.schema?.type || 'any';
  }

  get required(): string[] {
    return this.schema?.required || [];
  }

  get properties(): [string, any][] {
    if (this.type === 'object' && this.schema?.properties) {
      return Object.entries(this.schema.properties);
    }
    return [];
  }

  isRequired(key: string): boolean {
    return this.required.includes(key);
  }

  getPropertyType(prop: any): string {
    return prop?.type || 'any';
  }

  hasNested(prop: any): boolean {
    return (prop.type === 'object' && prop.properties) || (prop.type === 'array' && prop.items);
  }

  getNestedSchema(prop: any): any {
    return prop.type === 'array' ? prop.items : prop;
  }

  get isOneOf(): boolean {
    return !!this.schema?.oneOf;
  }

  get isObject(): boolean {
    return this.type === 'object' && !!this.schema?.properties;
  }

  get isArray(): boolean {
    return this.type === 'array' && !!this.schema?.items;
  }

  get arrayItems(): any {
    return this.schema?.items;
  }

  get oneOfSchemas(): any[] {
    return this.schema?.oneOf || [];
  }

  get format(): string | undefined {
    return this.schema?.format;
  }

  get description(): string | undefined {
    return this.schema?.description;
  }
}
