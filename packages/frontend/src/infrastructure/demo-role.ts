export type DemoRole = 'buyer' | 'merchant';

const STORAGE_KEY = 'parcel-tracker/demo-role';

export function getDemoRole(): DemoRole {
  const role = window.sessionStorage.getItem(STORAGE_KEY);
  return role === 'merchant' ? role : 'buyer';
}

export function setDemoRole(role: DemoRole): void {
  window.sessionStorage.setItem(STORAGE_KEY, role);
}
