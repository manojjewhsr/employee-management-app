import React, { useState, useEffect } from 'react';
import './App.css';

const API_URL = 'http://localhost:5000/api';

function App() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    department: '',
    role: '',
    hireDate: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch employees
  const fetchEmployees = async (department = '') => {
    try {
      setLoading(true);
      const url = department 
        ? `${API_URL}/employees?department=${encodeURIComponent(department)}`
        : `${API_URL}/employees`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch employees');
      const data = await response.json();
      setEmployees(data);
      setError('');
    } catch (err) {
      setError('Failed to load employees: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch departments
  const fetchDepartments = async () => {
    try {
      const response = await fetch(`${API_URL}/departments`);
      if (!response.ok) throw new Error('Failed to fetch departments');
      const data = await response.json();
      setDepartments(data);
    } catch (err) {
      console.error('Failed to load departments:', err);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchDepartments();
  }, []);

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const url = editingEmployee
        ? `${API_URL}/employees/${editingEmployee.id}`
        : `${API_URL}/employees`;
      
      const method = editingEmployee ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save employee');
      }

      // Reset form and refresh list
      setFormData({
        name: '',
        email: '',
        department: '',
        role: '',
        hireDate: ''
      });
      setShowForm(false);
      setEditingEmployee(null);
      fetchEmployees(selectedDepartment);
      fetchDepartments();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle delete
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this employee?')) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/employees/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete employee');
      }

      fetchEmployees(selectedDepartment);
      fetchDepartments();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle edit
  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    setFormData({
      name: employee.name,
      email: employee.email,
      department: employee.department,
      role: employee.role,
      hireDate: employee.hireDate
    });
    setShowForm(true);
  };

  // Handle cancel
  const handleCancel = () => {
    setShowForm(false);
    setEditingEmployee(null);
    setFormData({
      name: '',
      email: '',
      department: '',
      role: '',
      hireDate: ''
    });
    setError('');
  };

  // Handle department filter
  const handleDepartmentFilter = (department) => {
    setSelectedDepartment(department);
    fetchEmployees(department);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Employee Management System</h1>
      </header>

      <main className="App-main">
        {error && <div className="error-message">{error}</div>}

        {/* Filter Section */}
        <div className="filter-section">
          <label htmlFor="department-filter">Filter by Department:</label>
          <select 
            id="department-filter"
            value={selectedDepartment} 
            onChange={(e) => handleDepartmentFilter(e.target.value)}
          >
            <option value="">All Departments</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
          <button 
            className="btn btn-primary" 
            onClick={() => setShowForm(true)}
          >
            Add New Employee
          </button>
        </div>

        {/* Employee Form */}
        {showForm && (
          <div className="form-container">
            <h2>{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="name">Name *</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email *</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="department">Department *</label>
                <input
                  type="text"
                  id="department"
                  name="department"
                  value={formData.department}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="role">Role *</label>
                <input
                  type="text"
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="hireDate">Hire Date *</label>
                <input
                  type="date"
                  id="hireDate"
                  name="hireDate"
                  value={formData.hireDate}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-success">
                  {editingEmployee ? 'Update' : 'Create'}
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={handleCancel}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Employee List */}
        <div className="employee-list">
          <h2>Employees {selectedDepartment && `- ${selectedDepartment}`}</h2>
          {loading ? (
            <p>Loading...</p>
          ) : employees.length === 0 ? (
            <p className="no-employees">No employees found</p>
          ) : (
            <table className="employee-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Hire Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.id}</td>
                    <td>{employee.name}</td>
                    <td>{employee.email}</td>
                    <td>{employee.department}</td>
                    <td>{employee.role}</td>
                    <td>{employee.hireDate}</td>
                    <td className="actions">
                      <button 
                        className="btn btn-edit" 
                        onClick={() => handleEdit(employee)}
                      >
                        Edit
                      </button>
                      <button 
                        className="btn btn-delete" 
                        onClick={() => handleDelete(employee.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
