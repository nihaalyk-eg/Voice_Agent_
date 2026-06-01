const fs = require('fs');
const path = require('path');
const db = require('./index');

async function runSeed() {
  console.log('Starting database seeding...');
  
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Seed properties
    console.log('Seeding properties...');
    const propertiesPath = path.join(__dirname, '../data/properties.json');
    if (fs.existsSync(propertiesPath)) {
      const properties = JSON.parse(fs.readFileSync(propertiesPath, 'utf8'));
      for (const prop of properties) {
        await client.query(`
          INSERT INTO properties (id, address, technician, technician_phone, company)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO NOTHING
        `, [prop.id, prop.address, prop.technician, prop.technician_phone, prop.company]);
      }
      console.log(`Seeded ${properties.length} properties.`);
    }

    // 2. Seed work_orders
    console.log('Seeding work orders...');
    const workOrdersPath = path.join(__dirname, '../data/work_orders.json');
    if (fs.existsSync(workOrdersPath)) {
      const workOrders = JSON.parse(fs.readFileSync(workOrdersPath, 'utf8'));
      for (const wo of workOrders) {
        await client.query(`
          INSERT INTO work_orders (
            id, property_address, apartment_number, is_common_area, issue_description,
            permit_master_key, special_notes, caller_phone_number, urgency_level,
            technician, technician_phone, status, scheduled_time, source,
            call_category, transcript_id, sender_email, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT (id) DO NOTHING
        `, [
          wo.id, wo.property_address, wo.apartment_number, wo.is_common_area, wo.issue_description,
          wo.permit_master_key, wo.special_notes, wo.caller_phone_number, wo.urgency_level,
          wo.technician, wo.technician_phone, wo.status, wo.scheduled_time, wo.source,
          wo.call_category, wo.transcript_id, wo.sender_email, wo.created_at ? new Date(wo.created_at) : new Date()
        ]);
      }
      console.log(`Seeded ${workOrders.length} work orders.`);
    }

    // 3. Seed communications
    console.log('Seeding communications...');
    const communicationsPath = path.join(__dirname, '../data/communications.json');
    if (fs.existsSync(communicationsPath)) {
      const communications = JSON.parse(fs.readFileSync(communicationsPath, 'utf8'));
      for (const comm of communications) {
        await client.query(`
          INSERT INTO communications (
            id, type, timestamp, linked_work_order, caller_phone, recipient_phone,
            summary, transcript, message, call_category, duration_seconds,
            sender_email, original_email, extracted_data, status, reason, property_address
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (id) DO NOTHING
        `, [
          comm.id, comm.type, comm.timestamp ? new Date(comm.timestamp) : new Date(),
          comm.linked_work_order, comm.caller_phone, comm.recipient_phone,
          comm.summary, comm.transcript ? JSON.stringify(comm.transcript) : null,
          comm.message, comm.call_category, comm.duration_seconds,
          comm.sender_email, comm.original_email ? JSON.stringify(comm.original_email) : null,
          comm.extracted_data ? JSON.stringify(comm.extracted_data) : null,
          comm.status, comm.reason, comm.property_address
        ]);
      }
      console.log(`Seeded ${communications.length} communications.`);
    }

    // 4. Seed email_templates
    console.log('Seeding email templates...');
    const templatesPath = path.join(__dirname, '../data/email_templates.json');
    if (fs.existsSync(templatesPath)) {
      const templates = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));
      for (const tpl of templates) {
        await client.query(`
          INSERT INTO email_templates (id, label, from_address, subject, body)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO NOTHING
        `, [tpl.id, tpl.label, tpl.from, tpl.subject, tpl.body]);
      }
      console.log(`Seeded ${templates.length} email templates.`);
    }

    await client.query('COMMIT');
    console.log('Seeding finished successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runSeed().then(() => db.close());
}

module.exports = runSeed;
