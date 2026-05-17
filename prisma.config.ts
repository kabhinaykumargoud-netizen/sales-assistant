import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy',
  },
  migrate: {
    async adapter() {
      const { Pool } = await import('pg');
      const { PrismaPg } = await import('@prisma/adapter-pg');
      // Supabase Transaction Pooler URL (port 6543) for runtime queries
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      return new PrismaPg(pool);
    },
  },
});
