import { BrowserModule } from '@angular/platform-browser';
import { RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';
import { SharedUiComponentsModule } from '@ngx-vertex/shared/ui/components';

import { AppComponent } from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    SharedUiComponentsModule,
    RouterModule.forRoot(
      [
        {
          path: '',
          loadChildren: () =>
            import('@ngx-vertex/demo/feature/home').then(
              (module) => module.DemoFeatureHomeModule
            ),
        },
        {
          path: 'demo',
          loadChildren: () =>
            import('@ngx-vertex/demo/feature/builder-demo').then(
              (module) => module.DemoFeatureBuilderDemoModule
            ),
        },
      ],
      {}
    ),
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
