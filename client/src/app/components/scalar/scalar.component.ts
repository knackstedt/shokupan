import { Component } from '@angular/core';

/**
 * ScalarComponent – embeds the existing Scalar plugin page as an iframe.
 * The Scalar plugin already themes itself using the Shokupan CSS variables,
 * so a full iframe embed gives a seamless experience without re-implementing
 * the Scalar UI in Angular.
 */
@Component({
  selector: 'skp-scalar',
  standalone: true,
  imports: [],
  templateUrl: './scalar.component.html',
  styleUrl: './scalar.component.scss',
})
export class ScalarComponent { }
