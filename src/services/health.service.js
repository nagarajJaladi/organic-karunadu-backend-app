const getHealthStatus = () => ({
  status: 'ok',
  service: 'organic-karunadu-backend-app',
  timestamp: new Date().toISOString()
});

module.exports = {
  getHealthStatus
};