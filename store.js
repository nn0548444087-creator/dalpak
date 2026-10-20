import { firebaseConfig } from './firebase-config.js';
import { createLocalStore } from './store-local.js';

export const cloudConfigured = !!firebaseConfig.apiKey && !/PASTE/.test(firebaseConfig.apiKey);

export async function createStore() {
  if (!cloudConfigured) return createLocalStore();
  const { createCloudStore } = await import('./store-cloud.js');
  return createCloudStore(firebaseConfig);
}
