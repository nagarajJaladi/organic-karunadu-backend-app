const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');

const healthRoutes = require('./routes/health.routes');

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/health', healthRoutes);

app.use((error, request, response, next) => {
  console.error(error);

  response.status(error.statusCode || 500).json({
    message: error.message || 'Internal server error'
  });
});

module.exports = app;