require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../src/config/prisma');

async function main() {
  const tableCheck = await prisma.$queryRawUnsafe(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'event_availability_blocks'
    );
  `);
  console.log('event_availability_blocks exists:', tableCheck[0].exists);

  if (!tableCheck[0].exists) {
    console.log('Creating event_availability_blocks table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS event_availability_blocks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_manager_id UUID NOT NULL,
        service_id UUID,
        venue_id UUID,
        title VARCHAR(255) NOT NULL,
        reason VARCHAR(50) NOT NULL DEFAULT 'UNAVAILABLE',
        start_at TIMESTAMP(6) NOT NULL,
        end_at TIMESTAMP(6) NOT NULL,
        is_all_day BOOLEAN NOT NULL DEFAULT false,
        notes TEXT,
        recurrence VARCHAR(30) DEFAULT 'NONE',
        buffer_minutes INT NOT NULL DEFAULT 0,
        max_concurrent_events INT NOT NULL DEFAULT 1,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_event_avail_user FOREIGN KEY (event_manager_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_event_avail_service FOREIGN KEY (service_id) REFERENCES event_services(id) ON DELETE SET NULL,
        CONSTRAINT fk_event_avail_venue FOREIGN KEY (venue_id) REFERENCES cafes(id) ON DELETE SET NULL
      );
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_event_avail_blocks_times 
      ON event_availability_blocks(event_manager_id, start_at, end_at);
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_event_avail_blocks_active 
      ON event_availability_blocks(event_manager_id, is_active);
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_event_avail_blocks_service 
      ON event_availability_blocks(service_id);
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_event_avail_blocks_venue 
      ON event_availability_blocks(venue_id);
    `);
    
    console.log('event_availability_blocks table and indexes created successfully!');
  }
}

main().catch(console.error).finally(() => process.exit());
