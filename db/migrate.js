const db = require('./index');

async function runMigrations() {
  console.log('Starting database migrations...');
  
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create properties table
    console.log('Creating properties table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS properties (
        id VARCHAR(50) PRIMARY KEY,
        address VARCHAR(255) NOT NULL UNIQUE,
        technician VARCHAR(255) NOT NULL,
        technician_phone VARCHAR(50),
        company VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // 2. Create work_orders table
    console.log('Creating work_orders table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS work_orders (
        id VARCHAR(50) PRIMARY KEY,
        property_address VARCHAR(255) NOT NULL,
        apartment_number VARCHAR(50),
        is_common_area BOOLEAN DEFAULT false,
        issue_description TEXT NOT NULL,
        permit_master_key BOOLEAN DEFAULT false,
        special_notes TEXT,
        caller_phone_number VARCHAR(100),
        urgency_level VARCHAR(20) DEFAULT 'Standard' CHECK (urgency_level IN ('Standard', 'Urgent', 'Emergency', 'Low')),
        technician VARCHAR(255),
        technician_phone VARCHAR(50),
        status VARCHAR(50) DEFAULT 'Assigned' CHECK (status IN ('Assigned', 'In Progress', 'Completed', 'Escalated', 'Pending')),
        scheduled_time VARCHAR(255),
        source VARCHAR(20) DEFAULT 'voice' CHECK (source IN ('voice', 'email', 'sms', 'manual')),
        call_category VARCHAR(50) DEFAULT 'fault_report',
        transcript_id VARCHAR(50), -- Left as simple VARCHAR to avoid circular foreign keys, can be linked at app level
        sender_email VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // 3. Create communications table
    console.log('Creating communications table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS communications (
        id VARCHAR(50) PRIMARY KEY,
        type VARCHAR(50) NOT NULL CHECK (type IN ('call_transcript', 'sms_confirmation', 'email_intake', 'escalation')),
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        linked_work_order VARCHAR(50) REFERENCES work_orders(id) ON DELETE SET NULL,
        caller_phone VARCHAR(100),
        recipient_phone VARCHAR(100),
        summary TEXT,
        transcript JSONB,
        message TEXT,
        call_category VARCHAR(50),
        duration_seconds INTEGER,
        sender_email VARCHAR(255),
        original_email JSONB,
        extracted_data JSONB,
        status VARCHAR(50),
        reason TEXT,
        property_address VARCHAR(255)
      )
    `);

    // 4. Create customers table
    console.log('Creating customers table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id VARCHAR(50) PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        phone_number VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(255),
        property_address VARCHAR(255),
        apartment_number VARCHAR(50),
        language_preference VARCHAR(20) DEFAULT 'Finnish',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // 5. Create email_templates table
    console.log('Creating email_templates table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id VARCHAR(50) PRIMARY KEY,
        label VARCHAR(255) NOT NULL,
        from_address VARCHAR(255),
        subject TEXT,
        body TEXT
      )
    `);

    // Indexes
    console.log('Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_properties_address ON properties(address);
      CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
      CREATE INDEX IF NOT EXISTS idx_work_orders_created_at ON work_orders(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_work_orders_source ON work_orders(source);
      CREATE INDEX IF NOT EXISTS idx_communications_type ON communications(type);
      CREATE INDEX IF NOT EXISTS idx_communications_timestamp ON communications(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_communications_linked_work_order ON communications(linked_work_order);
      CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone_number);
      CREATE INDEX IF NOT EXISTS idx_customers_property ON customers(property_address);
    `);

    await client.query('COMMIT');
    console.log('Migrations executed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations().then(() => db.close());
}

module.exports = runMigrations;
