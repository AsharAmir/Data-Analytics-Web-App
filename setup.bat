@echo off
echo 🚀 Setting up Data Analytics Web Application...

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python is not installed. Please install Python 3.8+ first.
    pause
    exit /b 1
)

:: Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18+ first.
    pause
    exit /b 1
)

echo ✅ Prerequisites check passed

:: Setup Backend
echo 📦 Setting up Backend...
cd backend

:: Create virtual environment
python -m venv venv
call venv\Scripts\activate

:: Install dependencies
pip install -r requirements.txt

echo ✅ Backend dependencies installed

:: Go back to root
cd ..

:: Setup Frontend
echo 📦 Setting up Frontend...
cd frontend

:: Install dependencies
npm install

:: Create environment file
echo NEXT_PUBLIC_API_URL=http://localhost:8000 > .env.local

echo ✅ Frontend dependencies installed

:: Go back to root
cd ..

echo 🎉 Setup complete!
echo.
echo 📋 Next steps:
echo 1. Configure your Oracle database connection in backend\config.py
echo 2. Import your SAMPLE_DATA.sql into Oracle database
echo 3. Start the backend: cd backend ^&^& python main.py
echo 4. Start the frontend: cd frontend ^&^& npm run dev
echo 5. Visit http://localhost:3000 and login with admin/admin123
echo.
echo 📖 For detailed instructions, see README.md
pause 