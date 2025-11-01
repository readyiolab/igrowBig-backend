const db = require("../config/db");
const {
  getDefaultHomePageData,
  getDefaultOpportunityPageData,
  getDefaultProductPageData,
} = require("../utils/defaultPageData");

// Create all default pages for a tenant
const createDefaultPagesForTenant = async (tenantId) => {
  const results = {
    homepage: false,
    opportunityPage: false,
    productPage: false,
    errors: [],
  };

  try {
    // 1. Create Homepage
    try {
      const homePageData = {
        tenant_id: tenantId,
        ...getDefaultHomePageData(),
      };
      await db.insert("tbl_home_pages", homePageData);
      results.homepage = true;
      console.log(`✅ Homepage created for tenant ${tenantId}`);
    } catch (error) {
      console.error(`❌ Homepage creation failed:`, error.message);
      results.errors.push({ page: "homepage", error: error.message });
    }

    // 2. Create Opportunity Page
    try {
      const opportunityPageData = {
        tenant_id: tenantId,
        ...getDefaultOpportunityPageData(),
      };
      await db.insert("tbl_opportunity_page", opportunityPageData);
      results.opportunityPage = true;
      console.log(`✅ Opportunity page created for tenant ${tenantId}`);
    } catch (error) {
      console.error(`❌ Opportunity page creation failed:`, error.message);
      results.errors.push({ page: "opportunity", error: error.message });
    }

    // 3. Create Product Page
    try {
      const productPageData = {
        tenant_id: tenantId,
        ...getDefaultProductPageData(),
      };
      await db.insert("tbl_product_page", productPageData);
      results.productPage = true;
      console.log(`✅ Product page created for tenant ${tenantId}`);
    } catch (error) {
      console.error(`❌ Product page creation failed:`, error.message);
      results.errors.push({ page: "product", error: error.message });
    }

    return results;
  } catch (error) {
    console.error("Error in createDefaultPagesForTenant:", error);
    throw error;
  }
};

module.exports = {
  createDefaultPagesForTenant,
};