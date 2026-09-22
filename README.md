# Organic Karunadu Backend

Node.js and Express backend for the Organic Karunadu application.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

The health endpoint is available at `http://localhost:5000/api/health`.

## Structure

```text
src/
  config/        Environment and application configuration
  controllers/   HTTP request handlers
  middleware/    Express middleware
  models/        Data models
  routes/        API route definitions
  services/      Business logic
  utils/         Shared utilities
  app.js         Express application setup
  server.js      Server entry point
```