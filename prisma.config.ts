import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  migrate: {
    // Supabase requires DIRECT_URL (port 5432) for schema migrations
    url: process.env.DIRECT_URL!,
    async adapter() {
      const { Pool } = await import('pg');
      const { PrismaPg } = await import('@prisma/adapter-pg');
      // Supabase Transaction Pooler URL (port 6543) for runtime queries
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      return new PrismaPg(pool);
    },
  },
});
