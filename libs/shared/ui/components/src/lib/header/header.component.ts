import { Component } from '@angular/core';

@Component({
    selector: 'ngx-vertex-header',
    templateUrl: './header.component.html',
    styleUrls: ['./header.component.scss'],
    standalone: false
})
export class HeaderComponent {
  public menuOpen = false;
}
