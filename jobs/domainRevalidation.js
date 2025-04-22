const cron = require('node-cron');
const { checkDomain } = require('../services/dnsService');
const { sendDomainNotification } = require('../config/email');
const { sendWebhook } = require('../services/webhookService');
const db = require('../config/db');

const revalidateDomains = () => {
  cron.schedule('0 0 * * *', async () => {
    console.log('Running domain revalidation job');
    const settings = await db.select('tbl_settings', '*', 'dns_status != ?', ['verified']);

    for (const setting of settings) {
      const domain = setting.domain_type === 'custom_domain'
        ? setting.primary_domain_name
        : `${setting.sub_domain}.begrat.com`;
      const result = await checkDomain(domain);

      if (result.status !== setting.dns_status) {
        await db.update('tbl_settings', {
          dns_status: result.status,
          updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        }, 'tenant_id = ?', [setting.tenant_id]);

        await db.insert('tbl_domain_logs', {
          tenant_id: setting.tenant_id,
          domain,
          status: result.status,
          message: result.error || 'DNS check completed',
          created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        });

        const tenant = await db.select('tbl_tenants', '*', 'id = ?', [setting.tenant_id]);
        await sendDomainNotification(tenant[0]?.email || setting.email_id, domain, result.status);
        await sendWebhook(setting.tenant_id, domain, result.status);
      }
    }
  });
};

module.exports = { revalidateDomains };