@echo off
echo Setting up Oracle Database with Docker...

echo.
echo Step 1: Checking if Docker is running...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not installed or running!
    echo Please install Docker Desktop from: https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

echo Docker found!

echo.
echo Step 2: Starting Oracle Database container...
docker-compose up -d

echo.
echo Step 3: Waiting for Oracle to initialize (this may take 2-3 minutes)...
timeout /t 10 /nobreak > nul
echo Checking database status...

:check_db
docker exec oracle-analytics-db sqlplus -s system/admin123@XE @/dev/null >nul 2>&1
if %errorlevel% neq 0 (
    echo Database still initializing... waiting 30 seconds
    timeout /t 30 /nobreak > nul
    goto check_db
)

echo.
echo Step 4: Database is ready! Loading sample data...
docker exec -i oracle-analytics-db sqlplus system/admin123@XE < SAMPLE_DATA.sql

echo.
echo Step 5: Creating application tables...
cd backend
python database.py

echo.
echo ==============================================
echo Oracle Database Setup Complete!
echo ==============================================
echo Connection Details:
echo Host: localhost
echo Port: 1521
echo Service: XE
echo Username: system
echo Password: admin123
echo ==============================================
echo.
echo You can now start the backend server with:
echo cd backend
echo python main.py
echo.
pause 