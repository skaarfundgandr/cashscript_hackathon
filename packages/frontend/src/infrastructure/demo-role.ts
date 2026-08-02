export type DemoRole = 'buyer' | 'merchant' | 'courier';

const STORAGE_KEY = 'hermes/demo-role';

export function getDemoRole(): DemoRole {
  const role = window.sessionStorage.getItem(STORAGE_KEY);
  return role === 'merchant' || role === 'courier' ? role : 'buyer';
}

export function setDemoRole(role: DemoRole): void {
  window.sessionStorage.setItem(STORAGE_KEY, role);
}
