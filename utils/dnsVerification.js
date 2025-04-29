const dns = require("dns").promises;

async function verifyTenantDomain(tenantId, domain) {
  const maxRetries = 3;
  let attempt = 1;

  while (attempt <= maxRetries) {
    try {
      console.log(`DNS Verification Attempt ${attempt} for tenant ${tenantId}, domain ${domain}`);
      const addresses = await dns.resolve(domain, "A");
      console.log(`DNS Resolved Addresses for ${domain}:`, addresses);

      if (addresses.includes("139.59.3.58")) {
        return { status: "verified" };
      }
      return { status: "unverified" };
    } catch (error) {
      console.error(`DNS Verification Error for ${domain} (Attempt ${attempt}):`, error);
      if (attempt === maxRetries) {
        return { status: "error", message: error.message };
      }
      attempt++;
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1s before retry
    }
  }
}

module.exports = { verifyTenantDomain };