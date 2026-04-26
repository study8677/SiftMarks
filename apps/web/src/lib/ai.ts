import { createProvider, type AIProvider } from '@siftmarks/ai';
import type { AIProviderConfig } from '@siftmarks/shared';
import { DEFAULT_SETTINGS } from '@siftmarks/shared';
import { getDB } from './db';

export function getAIProvider(): AIProvider {
  const db = getDB();
  const configStr = db.getSetting('aiProvider');
  const config: AIProviderConfig = configStr
    ? JSON.parse(configStr)
    : DEFAULT_SETTINGS.aiProvider;
  return createProvider(config);
}
