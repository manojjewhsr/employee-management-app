const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(limiter);

// Database setup
const dbPath = path.join(__dirname, 'employees.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initDatabase();
  }
});

// Initialize database schema
function initDatabase() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      department TEXT NOT NULL,
      role TEXT NOT NULL,
      hireDate TEXT NOT NULL
    )
  `;
  
  db.run(createTableQuery, (err) => {
    if (err) {
      console.error('Error creating table:', err.message);
    } else {
      console.log('Employees table initialized');
    }
  });
}

// GET all employees or filter by department
app.get('/api/employees', (req, res) => {
  const { department } = req.query;
  
  let query = 'SELECT * FROM employees';
  let params = [];
  
  if (department) {
    query += ' WHERE department = ?';
    params.push(department);
  }
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ 
        error: 'Failed to fetch employees',
        message: err.message 
      });
    }
    res.json(rows);
  });
});

// GET single employee by ID
app.get('/api/employees/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM employees WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ 
        error: 'Failed to fetch employee',
        message: err.message 
      });
    }
    if (!row) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(row);
  });
});

// POST create new employee
app.post('/api/employees', (req, res) => {
  const { name, email, department, role, hireDate } = req.body;
  
  // Validation
  if (!name || !email || !department || !role || !hireDate) {
    return res.status(400).json({ 
      error: 'All fields are required',
      required: ['name', 'email', 'department', 'role', 'hireDate']
    });
  }
  
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  
  const query = `
    INSERT INTO employees (name, email, department, role, hireDate)
    VALUES (?, ?, ?, ?, ?)
  `;
  
  db.run(query, [name, email, department, role, hireDate], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ 
          error: 'Employee with this email already exists' 
        });
      }
      return res.status(500).json({ 
        error: 'Failed to create employee',
        message: err.message 
      });
    }
    
    res.status(201).json({
      id: this.lastID,
      name,
      email,
      department,
      role,
      hireDate
    });
  });
});

// PUT update employee
app.put('/api/employees/:id', (req, res) => {
  const { id } = req.params;
  const { name, email, department, role, hireDate } = req.body;
  
  // Validation
  if (!name || !email || !department || !role || !hireDate) {
    return res.status(400).json({ 
      error: 'All fields are required',
      required: ['name', 'email', 'department', 'role', 'hireDate']
    });
  }
  
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  
  const query = `
    UPDATE employees 
    SET name = ?, email = ?, department = ?, role = ?, hireDate = ?
    WHERE id = ?
  `;
  
  db.run(query, [name, email, department, role, hireDate, id], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ 
          error: 'Employee with this email already exists' 
        });
      }
      return res.status(500).json({ 
        error: 'Failed to update employee',
        message: err.message 
      });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    res.json({
      id: parseInt(id),
      name,
      email,
      department,
      role,
      hireDate
    });
  });
});

// DELETE employee
app.delete('/api/employees/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM employees WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ 
        error: 'Failed to delete employee',
        message: err.message 
      });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    res.json({ message: 'Employee deleted successfully' });
  });
});

// GET unique departments
app.get('/api/departments', (req, res) => {
  db.all('SELECT DISTINCT department FROM employees ORDER BY department', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ 
        error: 'Failed to fetch departments',
        message: err.message 
      });
    }
    res.json(rows.map(row => row.department));
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed');
    }
    process.exit(0);
  });
});
