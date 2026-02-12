# Employee Management System

An enterprise employee management system with CRUD operations built with Node.js, Express, SQLite, and React.

## Features

- ✅ Complete CRUD operations (Create, Read, Update, Delete) for employee records
- ✅ Employee fields: ID, Name, Email, Department, Role, Hire Date
- ✅ Search and filter employees by department
- ✅ RESTful API design
- ✅ Clean, maintainable code with proper error handling
- ✅ Responsive UI design
- ✅ Input validation and unique email constraint

## Tech Stack

**Backend:**
- Node.js
- Express.js
- SQLite3
- CORS enabled

**Frontend:**
- React
- Modern React Hooks (useState, useEffect)
- Fetch API for HTTP requests

## Project Structure

```
employee-management-app/
├── backend/
│   ├── server.js          # Express server with RESTful API
│   ├── package.json
│   ├── .gitignore
│   └── employees.db       # SQLite database (created on first run)
├── frontend/
│   ├── src/
│   │   ├── App.js         # Main React component
│   │   ├── App.css        # Styling
│   │   └── ...
│   ├── package.json
│   └── public/
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/employees` | Get all employees (supports ?department=X query param) |
| GET | `/api/employees/:id` | Get a single employee by ID |
| POST | `/api/employees` | Create a new employee |
| PUT | `/api/employees/:id` | Update an employee |
| DELETE | `/api/employees/:id` | Delete an employee |
| GET | `/api/departments` | Get list of all unique departments |

## Setup and Installation

### Prerequisites
- Node.js (v14 or higher)
- npm

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

   The backend server will start on `http://localhost:5000`

### Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the React development server:
   ```bash
   npm start
   ```

   The frontend will start on `http://localhost:3000` and automatically open in your browser.

## Usage

1. **Add Employee**: Click the "Add New Employee" button to open the form
2. **View Employees**: All employees are displayed in a table
3. **Filter by Department**: Use the dropdown to filter employees by department
4. **Edit Employee**: Click "Edit" button on any employee row
5. **Delete Employee**: Click "Delete" button (with confirmation)

## Database Schema

```sql
CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  department TEXT NOT NULL,
  role TEXT NOT NULL,
  hireDate TEXT NOT NULL
);
```

## Error Handling

The application includes comprehensive error handling:
- Input validation on both frontend and backend
- Unique email constraint
- Proper HTTP status codes (200, 201, 400, 404, 409, 500)
- User-friendly error messages
- Database connection error handling

## Development

### Running Both Servers

You need to run both backend and frontend servers simultaneously:

**Terminal 1 - Backend:**
```bash
cd backend && npm start
```

**Terminal 2 - Frontend:**
```bash
cd frontend && npm start
```

## License

ISC

