const dns = require('dns').promises;

async function verifyTenantDomain(tenantId, domain) {
  try {
    const addresses = await dns.resolve(domain, 'A');
    if (addresses.includes('139.59.3.58')) {
      return { status: 'verified' };
    }
    return { status: 'unverified' };
  } catch (error) {
    console.error(`DNS Verification Error for ${domain}:`, error);
    return { status: 'error' };
  }
}

module.exports = { verifyTenantDomain };