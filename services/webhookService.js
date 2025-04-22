const sendWebhook = async (tenantId, domain, status) => {
  console.log(`Sending webhook for tenant ${tenantId}, domain ${domain}, status ${status}`);
  // Implement your webhook logic
};

module.exports = { sendWebhook };