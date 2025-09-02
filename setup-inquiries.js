const db = require('./database/db');

async function setupInquiriesTable() {
  try {
    console.log('Setting up inquiries table...');
    
    // Create inquiries table
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS inquiries (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        subject VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        inquiry_type ENUM('general', 'service', 'billing', 'support', 'other') DEFAULT 'general',
        status ENUM('pending', 'in_progress', 'resolved', 'closed') DEFAULT 'pending',
        priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
        assigned_to INT,
        response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES branches(id),
        FOREIGN KEY (assigned_to) REFERENCES staff(id)
      )
    `;
    
    await db.query(createTableQuery);
    console.log('✅ Inquiries table created successfully!');
    
    // Insert some sample data (requires existing branches)
    const sampleInquiries = [
      {
        user_id: 1, // Assuming branch ID 1 exists
        subject: 'Service Inquiry',
        message: 'I would like to know more about your security services and pricing.',
        inquiry_type: 'service'
      },
      {
        user_id: 1, // Assuming branch ID 1 exists
        subject: 'Billing Question',
        message: 'I have a question about my recent invoice. Can you please clarify the charges?',
        inquiry_type: 'billing'
      }
    ];
    
    for (const inquiry of sampleInquiries) {
      await db.query(
        `INSERT INTO inquiries (user_id, subject, message, inquiry_type) 
         VALUES (?, ?, ?, ?)`,
        [inquiry.user_id, inquiry.subject, inquiry.message, inquiry.inquiry_type]
      );
    }
    
    console.log('✅ Sample inquiries data inserted successfully!');
    console.log('🎉 Inquiry system setup complete!');
    
  } catch (error) {
    console.error('❌ Error setting up inquiries table:', error);
  } finally {
    process.exit(0);
  }
}

setupInquiriesTable(); 