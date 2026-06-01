module.exports = {
  PROPERTIES_LIST: 'cache:properties:all',       // TTL 300s (5 min)
  WORK_ORDERS_LIST: 'cache:work_orders:all',      // TTL 60s (1 min)
  EMAIL_TEMPLATES_LIST: 'cache:email_templates:all', // TTL 600s (10 min)
  RATE_LIMIT_PREFIX: 'rate:',                     // Dynamic TTL per-IP
};
