module.exports = {
  PROPERTIES_LIST: 'cache:properties:all',
  WORK_ORDERS_LIST: 'cache:work_orders:all',
  EMAIL_TEMPLATES_LIST: 'cache:email_templates:all',
  CUSTOMER_PROFILE: (phone) => `cache:customer:${phone}`, // TTL 3600s (1 hr)
  RATE_LIMIT_PREFIX: 'rate:',
};
