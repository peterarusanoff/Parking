import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      'postgresql://vend:vend_dev_pass@localhost:5432/vend_assessment',
  },
  verbose: true,
  strict: true,
});


