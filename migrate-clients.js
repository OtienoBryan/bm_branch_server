const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateClientsTable() {
  let connection;

  try {
    // Create connection to the database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'bm_admin_db'
    });

    console.log('Connected to database');

    // Check if account_number column exists
    const [columns] = await connection.query('SHOW COLUMNS FROM clients LIKE "account_number"');
    if (columns.length === 0) {
      console.log('Adding account_number column...');
      await connection.query('ALTER TABLE clients ADD COLUMN account_number VARCHAR(255) NOT NULL DEFAULT "ACC001"');
      console.log('account_number column added');
    } else {
      console.log('account_number column already exists');
    }

    // Check if balance column exists
    const [balanceColumns] = await connection.query('SHOW COLUMNS FROM clients LIKE "balance"');
    if (balanceColumns.length === 0) {
      console.log('Adding balance column...');
      await connection.query('ALTER TABLE clients ADD COLUMN balance DECIMAL(10, 2) DEFAULT 0.00');
      console.log('balance column added');
    } else {
      console.log('balance column already exists');
    }

    // Update existing records to have unique account numbers if they don't have them
    const [clients] = await connection.query('SELECT id, account_number FROM clients');
    for (const client of clients) {
      if (!client.account_number || client.account_number === 'ACC001') {
        const newAccountNumber = `ACC${String(client.id).padStart(3, '0')}`;
        await connection.query('UPDATE clients SET account_number = ? WHERE id = ?', [newAccountNumber, client.id]);
        console.log(`Updated client ${client.id} with account number: ${newAccountNumber}`);
      }
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
}

// Run the migration
migrateClientsTable()
  .then(() => {
    console.log('Client table migration completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Client table migration failed:', error);
    process.exit(1);
  });



