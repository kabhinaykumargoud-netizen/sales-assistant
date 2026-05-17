import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  migrate: {
    // Used by prisma db push / prisma migrate deploy on Railway
    url: process.env.DATABASE_URL!,
    async adapter() {
      const { Pool } = await import('pg');
      const { PrismaPg } = await import('@prisma/adapter-pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      return new PrismaPg(pool);
    },
  },
});
