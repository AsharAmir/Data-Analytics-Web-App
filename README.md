# Data Analytics Web Application

A comprehensive data analytics platform built with Python FastAPI backend, Oracle Database, and Next.js frontend with dynamic dashboards and reports.

## 🚀 Features

### Backend Features
- **FastAPI** with Python for high-performance API
- **Oracle Database** connectivity with pyodbc
- **JWT Authentication** with form and SAML support (configurable)
- **Dynamic SQL Query Execution** with results caching
- **Large Dataset Handling** with pagination and streaming
- **Export Functionality** to Excel, CSV, and PDF
- **Dynamic Menu System** stored in database
- **Real-time Dashboard Widgets**

### Frontend Features
- **Next.js 14** with TypeScript
- **Tailwind CSS** for modern, responsive design
- **Chart.js** integration for all major chart types (bar, pie, line, doughnut, etc.)
- **Dynamic Sidebar Navigation** from database
- **Responsive Dashboard Layout**
- **Advanced Filtering** with real-time table updates
- **Export Capabilities** from frontend
- **Mobile-Responsive Design**

## 📋 Prerequisites

### Backend Requirements
- Python 3.8+
- Oracle Database (11g+) or Oracle XE
- Oracle Client Libraries (Oracle Instant Client)

### Frontend Requirements
- Node.js 18+
- npm or yarn

## 🛠️ Installation & Setup

### 1. Database Setup

First, ensure your Oracle database is running and you have the sample data loaded:

```sql
-- The SAMPLE_DATA.sql file should be imported into your Oracle database
-- This contains the SAMPLE_BT table with your financial data
```

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Configure database connection
# Edit backend/config.py with your Oracle database details:
# - db_host: Your Oracle server hostname
# - db_port: Oracle port (usually 1521)
# - db_service_name: Your Oracle service name
# - db_username: Database username
# - db_password: Database password

# Initialize database tables
python -c "from database import init_database; init_database()"

# Start the backend server
python main.py
```

The backend will start on `http://localhost:8000`

### 3. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Create environment file
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

# Start the development server
npm run dev
```

The frontend will start on `http://localhost:3000`

## 🗄️ Database Schema

The application creates the following tables in your Oracle database:

### Application Tables
- `app_users` - User authentication
- `app_menu_items` - Dynamic menu structure
- `app_queries` - Stored SQL queries with chart configurations
- `app_dashboard_widgets` - Dashboard widget layout

### Sample Data Tables
- `sample_bt` - Your imported financial data

## 🔧 Configuration

### Backend Configuration (`backend/config.py`)

```python
# Database Configuration
db_host = "localhost"  # Your Oracle server
db_port = 1521
db_service_name = "XEPDB1"  # Your Oracle service name
db_username = "your_username"
db_password = "your_password"

# Authentication Mode
auth_mode = "form"  # or "saml"

# JWT Configuration
secret_key = "your-secret-key"
access_token_expire_minutes = 30
```

### Frontend Configuration

Create `.env.local` in the frontend directory:
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 🎯 Usage

### 1. Login
- Default credentials: `admin` / `admin123`
- Navigate to `http://localhost:3000/login`

### 2. Dashboard
- View dynamic widgets showing your financial data
- Charts are generated from SQL queries stored in the database
- Responsive layout that adapts to different screen sizes

### 3. Reports
- Navigate through the dynamic sidebar menu
- Each report section contains multiple report options
- Filter data in real-time
- Export results to Excel or CSV

### 4. Adding New Dashboards/Reports

You can add new menu items and queries directly to the database:

```sql
-- Add a new menu item
INSERT INTO app_menu_items (name, type, icon, parent_id, sort_order) 
VALUES ('Risk Analysis', 'report', 'shield-exclamation', NULL, 3);

-- Add a new query
INSERT INTO app_queries (name, description, sql_query, chart_type, chart_config, menu_item_id) 
VALUES (
  'Top Risk Categories',
  'Analysis of risk by category',
  'SELECT ct_main, SUM(fcc_bkv) as risk_value FROM sample_bt WHERE fcc_bkv > 1000 GROUP BY ct_main ORDER BY risk_value DESC FETCH FIRST 10 ROWS ONLY',
  'bar',
  '{"responsive": true, "indexAxis": "y"}',
  3
);

-- Add a dashboard widget
INSERT INTO app_dashboard_widgets (title, query_id, position_x, position_y, width, height) 
VALUES ('Risk Analysis', 4, 0, 8, 12, 4);
```

## 📊 Sample Queries

The application comes with several pre-configured queries based on your `SAMPLE_BT` data:

1. **Daily Financial Summary** - Bar chart showing BKV and ION values by day
2. **Main Category Distribution** - Pie chart of record distribution
3. **Financial Values Trend** - Line chart showing BKV trends over time
4. **Top Categories by Value** - Horizontal bar chart of top performers

## 🔒 Security Features

- JWT-based authentication
- CORS protection
- SQL injection prevention through parameterized queries
- Secure cookie handling
- Environment-based configuration

## 📈 Performance Optimizations

- **Database Connection Pooling** with pyodbc
- **Pagination** for large datasets (configurable page sizes)
- **Streaming Responses** for large exports
- **Frontend Caching** with React Query
- **Efficient Chart Rendering** with Chart.js
- **Responsive Image Loading**

## 🔧 Customization

### Adding New Chart Types

1. Update the `ChartComponent` in `frontend/src/components/Charts/ChartComponent.tsx`
2. Add the new chart type to the type definitions
3. Register additional Chart.js components if needed

### Custom Authentication

To switch to SAML authentication:

1. Update `auth_mode = "saml"` in `backend/config.py`
2. Configure SAML settings (IDP URL, certificates, etc.)
3. Implement SAML response handling in `backend/auth.py`

### Database Customization

- Add new tables and update models in `backend/models.py`
- Create new API endpoints in `backend/main.py`
- Update frontend types in `frontend/src/types/index.ts`

## 🚀 Production Deployment

### Backend Deployment

```bash
# Install production dependencies
pip install gunicorn

# Run with Gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Frontend Deployment

```bash
# Build for production
npm run build

# Start production server
npm start
```

### Environment Variables for Production

```bash
# Backend
DB_HOST=your-production-oracle-server
DB_USERNAME=your-production-username
DB_PASSWORD=your-secure-password
SECRET_KEY=your-production-secret-key
CORS_ORIGINS=https://your-domain.com

# Frontend
NEXT_PUBLIC_API_URL=https://your-api-domain.com
```

## 🐛 Troubleshooting

### Common Issues

1. **Oracle Connection Issues**
   - Ensure Oracle Client is installed and configured
   - Check TNS names and connection strings
   - Verify firewall settings

2. **Chart Not Displaying**
   - Check browser console for JavaScript errors
   - Verify API responses return correct data format
   - Ensure Chart.js is properly imported

3. **Authentication Issues**
   - Check JWT token expiration
   - Verify CORS settings
   - Clear browser cookies and localStorage

### Debug Mode

Enable debug mode by setting `DEBUG=true` in your environment or config file.

## 📝 API Documentation

Once the backend is running, visit `http://localhost:8000/docs` for interactive API documentation powered by FastAPI's automatic OpenAPI generation.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Check the troubleshooting section above
- Review the API documentation at `/docs`
- Check the browser console for frontend issues
- Verify database connections and data

## 🔄 Version History

- **v1.0.0** - Initial release with core functionality
  - FastAPI backend with Oracle integration
  - Next.js frontend with Chart.js
  - Dynamic dashboards and reports
  - Authentication and authorization
  - Export functionality

---

**Built with ❤️ using FastAPI, Oracle Database, Next.js, and Chart.js** 