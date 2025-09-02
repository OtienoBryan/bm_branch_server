const db = require('../database/db');

const inquiryController = {
  // Get all inquiries
  getInquiries: async (req, res) => {
    try {
      const [inquiries] = await db.query(
        `SELECT i.*, b.name as user_name, b.email as user_email, s.name as assigned_staff_name
         FROM inquiries i
         LEFT JOIN branches b ON i.user_id = b.id
         LEFT JOIN staff s ON i.assigned_to = s.id
         ORDER BY i.created_at DESC`
      );
      res.json(inquiries);
    } catch (error) {
      console.error('Error fetching inquiries:', error);
      res.status(500).json({ message: 'Failed to fetch inquiries', error: error.message });
    }
  },

  // Get a single inquiry by ID
  getInquiryById: async (req, res) => {
    try {
      const { id } = req.params;
      const [inquiries] = await db.query(
        `SELECT i.*, b.name as user_name, b.email as user_email, s.name as assigned_staff_name
         FROM inquiries i
         LEFT JOIN branches b ON i.user_id = b.id
         LEFT JOIN staff s ON i.assigned_to = s.id
         WHERE i.id = ?`,
        [id]
      );

      if (inquiries.length === 0) {
        return res.status(404).json({ message: 'Inquiry not found' });
      }

      res.json(inquiries[0]);
    } catch (error) {
      console.error('Error fetching inquiry:', error);
      res.status(500).json({ message: 'Failed to fetch inquiry', error: error.message });
    }
  },

  // Create a new inquiry
  createInquiry: async (req, res) => {
    try {
      const { subject, message, inquiry_type } = req.body;

      // Validate required fields
      if (!subject || !message) {
        return res.status(400).json({ 
          message: 'Subject and message are required' 
        });
      }

      // Get user ID from JWT token
      const userId = req.user?.branchId;
      if (!userId) {
        return res.status(401).json({ 
          message: 'User not authenticated' 
        });
      }

      // Insert the inquiry
      const [result] = await db.query(
        `INSERT INTO inquiries (
          user_id, subject, message, inquiry_type
        ) VALUES (?, ?, ?, ?)`,
        [userId, subject, message, inquiry_type || 'general']
      );

      // Fetch the created inquiry with user info
      const [inquiries] = await db.query(
        `SELECT i.*, b.name as user_name, b.email as user_email
         FROM inquiries i
         LEFT JOIN branches b ON i.user_id = b.id
         WHERE i.id = ?`,
        [result.insertId]
      );

      res.status(201).json(inquiries[0]);
    } catch (error) {
      console.error('Error creating inquiry:', error);
      res.status(500).json({ message: 'Failed to create inquiry', error: error.message });
    }
  },

  // Update an inquiry (admin/staff only)
  updateInquiry: async (req, res) => {
    try {
      const { id } = req.params;
      const { status, priority, assigned_to, response } = req.body;

      // Check if inquiry exists
      const [existingInquiries] = await db.query(
        'SELECT id FROM inquiries WHERE id = ?',
        [id]
      );

      if (existingInquiries.length === 0) {
        return res.status(404).json({ message: 'Inquiry not found' });
      }

      // Update the inquiry
      const [result] = await db.query(
        `UPDATE inquiries 
         SET status = ?, priority = ?, assigned_to = ?, response = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [status, priority, assigned_to, response, id]
      );

      // Fetch the updated inquiry
      const [inquiries] = await db.query(
        'SELECT * FROM inquiries WHERE id = ?',
        [id]
      );

      res.json(inquiries[0]);
    } catch (error) {
      console.error('Error updating inquiry:', error);
      res.status(500).json({ message: 'Failed to update inquiry', error: error.message });
    }
  },

  // Delete an inquiry (admin only)
  deleteInquiry: async (req, res) => {
    try {
      const { id } = req.params;

      // Check if inquiry exists
      const [existingInquiries] = await db.query(
        'SELECT id FROM inquiries WHERE id = ?',
        [id]
      );

      if (existingInquiries.length === 0) {
        return res.status(404).json({ message: 'Inquiry not found' });
      }

      // Delete the inquiry
      await db.query('DELETE FROM inquiries WHERE id = ?', [id]);

      res.json({ message: 'Inquiry deleted successfully' });
    } catch (error) {
      console.error('Error deleting inquiry:', error);
      res.status(500).json({ message: 'Failed to delete inquiry', error: error.message });
    }
  },

  // Get inquiries by status
  getInquiriesByStatus: async (req, res) => {
    try {
      const { status } = req.params;
      const [inquiries] = await db.query(
        `SELECT i.*, b.name as user_name, b.email as user_email, s.name as assigned_staff_name
         FROM inquiries i
         LEFT JOIN branches b ON i.user_id = b.id
         LEFT JOIN staff s ON i.assigned_to = s.id
         WHERE i.status = ?
         ORDER BY i.created_at DESC`,
        [status]
      );
      res.json(inquiries);
    } catch (error) {
      console.error('Error fetching inquiries by status:', error);
      res.status(500).json({ message: 'Failed to fetch inquiries', error: error.message });
    }
  },

  // Get inquiries by type
  getInquiriesByType: async (req, res) => {
    try {
      const { type } = req.params;
      const [inquiries] = await db.query(
        `SELECT i.*, b.name as user_name, b.email as user_email, s.name as assigned_staff_name
         FROM inquiries i
         LEFT JOIN branches b ON i.user_id = b.id
         LEFT JOIN staff s ON i.assigned_to = s.id
         WHERE i.inquiry_type = ?
         ORDER BY i.created_at DESC`,
        [type]
      );
      res.json(inquiries);
    } catch (error) {
      console.error('Error fetching inquiries by type:', error);
      res.status(500).json({ message: 'Failed to fetch inquiries', error: error.message });
    }
  }
};

module.exports = inquiryController; 