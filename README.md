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
cd /Users/nagarajjaladi/Documents/development/projects/organic-webapp/karunadu-backend
npm run seed

To recreate the database from scratch, this deletes all its existing data:


dropdb organickarunadu
createdb organickarunadu
npm run seed

Stop the backend before dropping the database. npm run seed -- --force clears the application tables and reseeds them, but does not drop and recreate the database schema.