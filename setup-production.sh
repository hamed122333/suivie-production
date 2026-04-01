#!/bin/bash

# Production Setup Script for Suivi Production
# This script helps configure environment variables securely

set -e

echo "🚀 Suivi Production - Production Setup"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env already exists
if [ -f .env ]; then
    echo -e "${YELLOW}Warning: .env file already exists.${NC}"
    read -p "Do you want to overwrite it? (yes/no): " overwrite
    if [ "$overwrite" != "yes" ]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

echo "This script will help you create a production-ready .env file."
echo ""

# Generate strong JWT secret
echo "Generating strong JWT_SECRET..."
JWT_SECRET=$(openssl rand -base64 48)
echo -e "${GREEN}✓ JWT_SECRET generated${NC}"
echo ""

# Generate strong database password
echo "Generating strong POSTGRES_PASSWORD..."
POSTGRES_PASSWORD=$(openssl rand -base64 32)
echo -e "${GREEN}✓ POSTGRES_PASSWORD generated${NC}"
echo ""

# Get production domain
read -p "Enter your production domain (e.g., example.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    DOMAIN="localhost"
    echo -e "${YELLOW}Warning: Using localhost as domain${NC}"
fi

# Set allowed origins
ALLOWED_ORIGINS="https://${DOMAIN},https://www.${DOMAIN}"
REACT_APP_API_URL="https://${DOMAIN}/api"

# Ask if using localhost for development
read -p "Is this for local development? (yes/no): " IS_LOCAL
if [ "$IS_LOCAL" = "yes" ]; then
    ALLOWED_ORIGINS="http://localhost:3000"
    REACT_APP_API_URL="http://localhost:5000/api"
fi

# Create .env file
cat > .env << EOF
# Suivi Production - Environment Configuration
# Generated: $(date)

# Database Configuration
POSTGRES_DB=suivi_production
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_PORT=5432

# Backend Configuration
NODE_ENV=production
BACKEND_PORT=5000

# JWT Secret (32+ characters required)
JWT_SECRET=${JWT_SECRET}

# CORS Configuration
ALLOWED_ORIGINS=${ALLOWED_ORIGINS}

# Frontend Configuration
FRONTEND_PORT=3000
REACT_APP_API_URL=${REACT_APP_API_URL}
EOF

echo ""
echo -e "${GREEN}✓ .env file created successfully!${NC}"
echo ""

# Create backend .env if needed
if [ -f backend/.env.example ] && [ ! -f backend/.env ]; then
    echo "Creating backend/.env..."
    cat > backend/.env << EOF
# Server Configuration
PORT=5000
NODE_ENV=production

# Database Configuration
DB_HOST=postgres
DB_PORT=5432
DB_NAME=suivi_production
DB_USER=postgres
DB_PASSWORD=${POSTGRES_PASSWORD}

# JWT Configuration
JWT_SECRET=${JWT_SECRET}

# CORS Configuration
ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
EOF
    echo -e "${GREEN}✓ backend/.env created${NC}"
fi

# Create frontend .env if needed
if [ -f frontend/.env.example ] && [ ! -f frontend/.env ]; then
    echo "Creating frontend/.env..."
    cat > frontend/.env << EOF
REACT_APP_API_URL=${REACT_APP_API_URL}
EOF
    echo -e "${GREEN}✓ frontend/.env created${NC}"
fi

echo ""
echo "======================================"
echo -e "${GREEN}Setup Complete!${NC}"
echo "======================================"
echo ""
echo "⚠️  IMPORTANT SECURITY NOTES:"
echo ""
echo "1. Your credentials have been saved to .env"
echo "2. NEVER commit .env files to git"
echo "3. Keep your JWT_SECRET and POSTGRES_PASSWORD secure"
echo "4. For production, consider using a secrets manager"
echo ""
echo "Your generated credentials:"
echo "JWT_SECRET: ${JWT_SECRET}"
echo "POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}"
echo ""
echo "Save these credentials in a secure password manager!"
echo ""
echo "Next steps:"
echo "1. Review and adjust .env if needed"
echo "2. Run: docker-compose up -d --build"
echo "3. Check: docker-compose ps"
echo "4. Access: ${REACT_APP_API_URL%/api}"
echo ""
