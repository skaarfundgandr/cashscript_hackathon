import { App } from './presentation/app.js';

if (window.location.pathname.replace(/\/+$/, '') === '/marketplace') {
  document.querySelector<HTMLElement>('#legacy-root')!.hidden = true;
  void import('./presentation/marketplace/main.js');
} else {
  const app = new App();
  app.init();
}
