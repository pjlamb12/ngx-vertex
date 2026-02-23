import { LandingComponent } from './landing.component';
describe('LandingComponent', () => {
  let component: LandingComponent;
  let mockNgxVertexService;
  beforeEach(() => {
    component = new LandingComponent(mockNgxVertexService);
  });
  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
