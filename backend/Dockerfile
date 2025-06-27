FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including those needed for xmlsec
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    pkg-config \
    libxml2-dev \
    libxmlsec1-dev \
    libxmlsec1-openssl \
    libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies with specific versions to avoid xmlsec conflicts
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir lxml==4.9.3 && \
    pip install --no-cache-dir xmlsec==1.3.13 && \
    pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY . .

# Expose the port
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"] 