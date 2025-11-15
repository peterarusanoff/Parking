import { isDevelopment } from '@/env';

const logWebhooks = isDevelopment && false ? true : false;

export const testLogger = {
  webhooks: {
    log: (message: string, ...args: unknown[]) => {
      if (logWebhooks) {
        console.log(`[TEST] ${message}`, ...args);
      }
    },
    info: (message: string, ...args: unknown[]) => {
      if (logWebhooks) {
        console.log(`[TEST] ${message}`, ...args);
      }
    },
    error: (message: string, ...args: unknown[]) => {
      if (logWebhooks) {
        console.log(`[TEST] ${message}`, ...args);
      }
    },
    warn: (message: string, ...args: unknown[]) => {
      if (logWebhooks) {
        console.log(`[TEST] ${message}`, ...args);
      }
    },
    debug: (message: string, ...args: unknown[]) => {
      if (logWebhooks) {
        console.log(`[TEST] ${message}`, ...args);
      }
    },
  },
};
