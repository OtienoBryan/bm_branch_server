const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database/db');
const staffController = require('./controllers/staffController');
const roleController = require('./controllers/roleController');
const { upload } = require('./config/cloudinary');
const uploadController = require('./controllers/uploadController');
const teamController = require('./controllers/teamController');
const clientController = require('./controllers/clientController');
const branchController = require('./controllers/branchController');
const serviceChargeController = require('./controllers/serviceChargeController');
const noticeController = require('./controllers/noticeController');
const inquiryController = require('./controllers/inquiryController');
require('dotenv').config();

const app = express();

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173', // Vite's default port
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint (no authentication required)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// JWT Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Helper function to map database fields to frontend fields
const mapRequestFields = (request) => ({
  id: request.id,
  userId: request.user_id,
  userName: request.user_name,
  serviceTypeId: request.service_type_id,
  serviceTypeName: request.service_type_name,
  pickupLocation: request.pickup_location,
  deliveryLocation: request.delivery_location,
  pickupDate: request.pickup_date,
  description: request.description,
  priority: request.priority,
  status: request.status,
  myStatus: request.my_status,
  branchId: request.branch_id,
  branchName: request.branch_name,
  clientName: request.client_name,
  price: request.price,
  latitude: request.latitude,
  longitude: request.longitude,
  team_id: request.team_id,
  createdAt: request.created_at,
  updatedAt: request.updated_at
});

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('Login attempt received:', req.body);
    const { username, password } = req.body;

    if (!username || !password) {
      console.log('Missing username or password');
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Get branch from database using name instead of username
    console.log('Querying database for branch:', username);
    const [branches] = await db.query(
      'SELECT * FROM branches WHERE name = ?',
      [username]
    );

    console.log('Database query result:', branches);

    if (branches.length === 0) {
      console.log('No branch found with name:', username);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const branch = branches[0];

    // Compare password
    console.log('Comparing passwords...');
    const isValidPassword = await bcrypt.compare(password, branch.password);
    console.log('Password comparison result:', isValidPassword);

    if (!isValidPassword) {
      console.log('Invalid password for branch:', username);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Create JWT token
    console.log('Creating JWT token for branch:', username);
    const token = jwt.sign(
      { 
        id: branch.id,
        branchId: branch.id,
        name: branch.name,
        role: branch.role,
        role_id: branch.role_id, // add this
        clientId: branch.client_id
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    console.log('Login successful for branch:', username);
    res.json({
      token,
      user: {
        id: branch.id,
        name: branch.name,
        email: branch.email,
        role: branch.role,
        role_id: branch.role_id, // add this
        client_id: branch.client_id
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Service Types routes
app.get('/api/service-types', async (req, res) => {
  try {
    const [serviceTypes] = await db.query(
      'SELECT * FROM service_types ORDER BY name'
    );
    res.json(serviceTypes);
  } catch (error) {
    console.error('Error fetching service types:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/service-types/:id', async (req, res) => {
  try {
    const [serviceTypes] = await db.query(
      'SELECT * FROM service_types WHERE id = ?',
      [req.params.id]
    );

    if (serviceTypes.length === 0) {
      return res.status(404).json({ message: 'Service type not found' });
    }

    res.json(serviceTypes[0]);
  } catch (error) {
    console.error('Error fetching service type:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Requests routes
app.get('/api/requests', authenticateToken, async (req, res) => {
  try {
    const { status, myStatus, branchId, pickupDate } = req.query;
    const userId = req.user.branchId; // Get the authenticated user's branch ID
    
    console.log('Authenticated user data:', req.user);
    console.log('Using userId for filtering:', userId);
    
    let query = `
      SELECT r.*, b.name as branch_name, c.name as client_name, st.name as service_type_name
      FROM requests r
      LEFT JOIN branches b ON r.branch_id = b.id
      LEFT JOIN clients c ON b.client_id = c.id
      LEFT JOIN service_types st ON r.service_type_id = st.id
    `;
    const params = [];
    const filters = ['r.branch_id = ?']; // Always filter by user's branch ID (which is the logged-in person's ID)
    params.push(userId);
    
    if (status) {
      filters.push('r.status = ?');
      params.push(status);
    }
    if (myStatus !== undefined) {
      filters.push('r.my_status = ?');
      params.push(myStatus);
    }
    if (branchId) {
      // Override the branch filter if branchId is provided (for admin purposes)
      const branchIndex = filters.indexOf('r.branch_id = ?');
      if (branchIndex !== -1) {
        filters[branchIndex] = 'r.branch_id = ?';
        params[0] = branchId; // Replace the first parameter (user's branch_id)
      }
    }
    if (pickupDate) {
      filters.push("DATE(r.pickup_date) = ?");
      params.push(pickupDate);
    }
    
    query += ' WHERE ' + filters.join(' AND ');
    query += ' ORDER BY r.created_at DESC';
    
    console.log('Final query:', query);
    console.log('Query params:', params);
    
    const [requests] = await db.query(query, params);
    // Debug: print the id and pickup_date of the first 5 results
    console.log('First 5 pickup_date values:', requests.slice(0, 5).map(r => ({ id: r.id, pickup_date: r.pickup_date })));
    res.json(requests.map(mapRequestFields));
  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/requests', authenticateToken, async (req, res) => {
  try {
    // Use branch info from authenticated user (JWT)
    let branchId = req.user.branchId; // Use the authenticated user's branch ID
    let branchName = req.user.name;
    // Fallback to body for backward compatibility
    if (!branchId) branchId = req.body.branchId;
    if (!branchName) branchName = req.body.branchName;

    // If branchName is missing, fetch it from the branches table
    if (!branchName && branchId) {
      const [branchRows] = await db.query('SELECT name FROM branches WHERE id = ?', [branchId]);
      if (branchRows.length > 0) {
        branchName = branchRows[0].name;
      }
    }

    const { 
      serviceTypeId,
      pickupLocation, 
      deliveryLocation, 
      pickupDate, 
      description, 
      priority,
      myStatus = 0,
      price,
      latitude,
      longitude
    } = req.body;

    console.log('Received request data:', {
      branchId,
      branchName,
      serviceTypeId,
      pickupLocation,
      deliveryLocation,
      pickupDate,
      description,
      priority,
      myStatus,
      price,
      latitude,
      longitude
    });

    // Validate required fields
    if (!branchId || !branchName || !serviceTypeId || !pickupLocation || !deliveryLocation || !pickupDate || !price) {
      console.log('Missing required fields:', {
        branchId: !branchId,
        branchName: !branchName,
        serviceTypeId: !serviceTypeId,
        pickupLocation: !pickupLocation,
        deliveryLocation: !deliveryLocation,
        pickupDate: !pickupDate,
        price: !price
      });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if service type exists
    const [serviceTypes] = await db.query(
      'SELECT id FROM service_types WHERE id = ?',
      [serviceTypeId]
    );

    if (serviceTypes.length === 0) {
      console.error('Service type not found:', serviceTypeId);
      return res.status(400).json({ message: 'Invalid service type' });
    }

    // Check if branch exists
    const [branches] = await db.query(
      'SELECT id FROM branches WHERE id = ?',
      [branchId]
    );

    if (branches.length === 0) {
      console.error('Branch not found:', branchId);
      return res.status(400).json({ message: 'Invalid branch' });
    }

    // Insert the request with price and coordinates
    const [result] = await db.query(
      `INSERT INTO requests (
        branch_id, service_type_id, 
        pickup_location, delivery_location, pickup_date, 
        description, priority, status, my_status, price,
        latitude, longitude
      ) VALUES (?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        branchId, serviceTypeId,
        pickupLocation, deliveryLocation, pickupDate,
        description || null, priority || 'medium', 'pending', myStatus, price,
        latitude || null, longitude || null
      ]
    );

    // Fetch the created request
    const [requests] = await db.query(
      'SELECT * FROM requests WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(mapRequestFields(requests[0]));
  } catch (error) {
    console.error('Error creating request:', error);
    res.status(500).json({ message: 'Error creating request', error: error.message });
  }
});

app.patch('/api/requests/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user.branchId; // Get the authenticated user's branch ID

    // Map frontend field names to database field names
    const dbUpdates = {
      branch_name: updates.branchName,
      service_type_id: updates.serviceTypeId,
      pickup_location: updates.pickupLocation,
      delivery_location: updates.deliveryLocation,
      pickup_date: updates.pickupDate,
      description: updates.description,
      priority: updates.priority,
      status: updates.status,
      my_status: updates.myStatus,
      team_id: updates.team_id,
      latitude: updates.latitude,
      longitude: updates.longitude
    };

    // If team_id is present, fetch crew_commander_id and set staff_id
    if (updates.team_id) {
      const [teamRows] = await db.query('SELECT crew_commander_id FROM teams WHERE id = ?', [updates.team_id]);
      if (teamRows.length > 0 && teamRows[0].crew_commander_id) {
        dbUpdates.staff_id = teamRows[0].crew_commander_id;
      }
    }

    // Remove undefined values
    Object.keys(dbUpdates).forEach(key => 
      dbUpdates[key] === undefined && delete dbUpdates[key]
    );

    // Build the SET clause dynamically based on provided updates
    const setClause = Object.keys(dbUpdates)
      .map(key => `${key} = ?`)
      .join(', ');
    
    const values = [...Object.values(dbUpdates), id, userId];

    await db.query(
      `UPDATE requests SET ${setClause} WHERE id = ? AND branch_id = ?`,
      values
    );

    // Get the updated request
    const [requests] = await db.query(
      'SELECT * FROM requests WHERE id = ? AND branch_id = ?',
      [id, userId]
    );

    if (requests.length === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    res.json(mapRequestFields(requests[0]));
  } catch (error) {
    console.error('Error updating request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete request
app.delete('/api/requests/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.branchId; // Get the authenticated user's branch ID
    
    // First check if the request exists and belongs to the user's branch
    const [existingRequest] = await db.query(
      'SELECT * FROM requests WHERE id = ? AND branch_id = ?', 
      [id, userId]
    );
    
    if (existingRequest.length === 0) {
      return res.status(404).json({ message: 'Request not found or access denied' });
    }
    
    // Delete the request
    const [result] = await db.query('DELETE FROM requests WHERE id = ? AND branch_id = ?', [id, userId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Requests routes
app.get('/api/runs/summaries', async (req, res) => {
  try {
    const { year, month, clientId, branchId } = req.query;
    let query = `
      SELECT 
        DATE(pickup_date) as date,
        COUNT(*) as totalRuns,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as totalRunsCompleted,
        SUM(price) as totalAmount,
        SUM(CASE WHEN status = 'completed' THEN price ELSE 0 END) as totalAmountCompleted
      FROM requests r
      LEFT JOIN branches b ON r.branch_id = b.id
      WHERE r.my_status = 3
    `;
    const params = [];

    if (year) {
      query += ' AND YEAR(r.pickup_date) = ?';
      params.push(year);
    }

    if (month) {
      query += ' AND MONTH(r.pickup_date) = ?';
      params.push(month);
    }

    if (clientId) {
      query += ' AND b.client_id = ?';
      params.push(clientId);
    }

    if (branchId) {
      query += ' AND r.branch_id = ?';
      params.push(branchId);
    }

    query += `
      GROUP BY DATE(r.pickup_date)
      ORDER BY date DESC
    `;

    const [summaries] = await db.query(query, params);
    res.json(summaries);
  } catch (error) {
    console.error('Error fetching run summaries:', error);
    res.status(500).json({ message: 'Error fetching run summaries', error: error.message });
  }
});

// Staff routes
app.get('/api/staff', staffController.getAllStaff);
app.get('/api/staff/:id', staffController.getStaffById);
app.post('/api/staff', staffController.createStaff);
app.put('/api/staff/:id', staffController.updateStaff);
app.delete('/api/staff/:id', staffController.deleteStaff);
app.put('/api/staff/:id/status', staffController.updateStaffStatus);

// Roles routes
app.get('/api/roles', roleController.getAllRoles);

// Upload routes
app.post('/api/upload', upload.single('photo'), uploadController.uploadImage);

// Team routes
app.post('/api/teams', teamController.createTeam);
app.get('/api/teams', teamController.getTeams);

// Client routes
app.get('/api/clients', clientController.getAllClients);
app.get('/api/clients/:id', clientController.getClient);
app.post('/api/clients', clientController.createClient);
app.put('/api/clients/:id', clientController.updateClient);
app.delete('/api/clients/:id', clientController.deleteClient);
app.get('/api/branches', branchController.getAllBranchesWithoutClient);
app.get('/api/clients/:clientId/branches', branchController.getAllBranches);
app.post('/api/clients/:clientId/branches', branchController.createBranch);
app.put('/api/clients/:clientId/branches/:branchId', branchController.updateBranch);
app.delete('/api/clients/:clientId/branches/:branchId', branchController.deleteBranch);
app.get('/api/clients/:clientId/service-charges', serviceChargeController.getServiceCharges);
app.post('/api/clients/:clientId/service-charges', serviceChargeController.createServiceCharge);
app.put('/api/clients/:clientId/service-charges/:chargeId', serviceChargeController.updateServiceCharge);
app.delete('/api/clients/:clientId/service-charges/:chargeId', serviceChargeController.deleteServiceCharge);

// Notice routes
app.get('/api/notices', noticeController.getNotices);
app.post('/api/notices', noticeController.createNotice);
app.patch('/api/notices/:id', noticeController.updateNotice);
app.delete('/api/notices/:id', noticeController.deleteNotice);
app.patch('/api/notices/:id/status', noticeController.toggleNoticeStatus);

// Inquiry routes
app.get('/api/inquiries', authenticateToken, inquiryController.getInquiries);
app.get('/api/inquiries/:id', authenticateToken, inquiryController.getInquiryById);
app.post('/api/inquiries', authenticateToken, inquiryController.createInquiry);
app.put('/api/inquiries/:id', authenticateToken, inquiryController.updateInquiry);
app.delete('/api/inquiries/:id', authenticateToken, inquiryController.deleteInquiry);
app.get('/api/inquiries/status/:status', authenticateToken, inquiryController.getInquiriesByStatus);
app.get('/api/inquiries/type/:type', authenticateToken, inquiryController.getInquiriesByType);

// SOS routes
app.get('/api/sos', async (req, res) => {
  try {
    const query = `
      SELECT s.*, st.name as guard_name
      FROM sos s
      LEFT JOIN staff st ON s.guard_id = st.id
      ORDER BY s.created_at DESC
    `;
    
    const [sosList] = await db.query(query);
    res.json(sosList);
  } catch (error) {
    console.error('Error fetching SOS list:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/sos/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, comment } = req.body;

    // Validate status
    const validStatuses = ['pending', 'in_progress', 'resolved'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const query = `
      UPDATE sos 
      SET status = ?,
          comment = ?
      WHERE id = ?
    `;
    
    await db.query(query, [status, comment || null, id]);
    
    // Fetch updated SOS record
    const [updatedSos] = await db.query(`
      SELECT s.*, st.name as guard_name
      FROM sos s
      LEFT JOIN staff st ON s.guard_id = st.id
      WHERE s.id = ?
    `, [id]);

    res.json(updatedSos[0]);
  } catch (error) {
    console.error('Error updating SOS status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Example API endpoint
app.get('/api/test', (req, res) => {
  db.query('SELECT 1 + 1 AS solution')
    .then(([results]) => {
      res.json({ message: 'Database connection successful', results });
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5004;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app; 