## Deployment Steps
- Initialize database tables: `python -c "from database import init_database; init_database()"`
- Start backend server: `python main.py`
- Navigate to frontend directory: `cd frontend`
- Install dependencies: `npm install`

## Deployment Notes
- After `npm run dev`, application launched but admin user was not created in the DB
- ROLE column still missing in APP_QUERIES table