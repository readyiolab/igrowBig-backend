const db = require("../config/db");

// Currency mappings
const currencyMap = {
  USD: "$",
  CAD: "C$",
  EUR: "€",
  BOB: "Bs.",
  BGN: "лв",
  CZK: "Kč",
  DKK: "kr",
  HUF: "Ft",
  INR: "₹",
  JPY: "¥",
  MXN: "MX$",
  NOK: "kr",
  PEN: "S/.",
  PLN: "zł",
  RON: "lei",
  RUB: "₽",
  SEK: "kr",
  GBP: "£",
  COP: "$",
  SGD: "S$",
};

const countryToCurrencyMap = {
  Austria: "EUR",
  Belgium: "EUR",
  Bolivia: "BOB",
  Bulgaria: "BGN",
  Canada: "CAD",
  Colombia: "COP",
  Croatia: "EUR",
  Cyprus: "EUR",
  "Czech Republic": "CZK",
  Denmark: "DKK",
  Estonia: "EUR",
  Finland: "EUR",
  France: "EUR",
  Germany: "EUR",
  Greece: "EUR",
  Hungary: "HUF",
  India: "INR",
  Ireland: "EUR",
  Italy: "EUR",
  Japan: "JPY",
  Malta: "EUR",
  Mexico: "MXN",
  Netherlands: "EUR",
  Norway: "NOK",
  Peru: "PEN",
  Poland: "PLN",
  Portugal: "EUR",
  Romania: "RON",
  Russia: "RUB",
  Singapore: "SGD",
  "Slovak Republic": "EUR",
  Slovenia: "EUR",
  Spain: "EUR",
  Sweden: "SEK",
  UK: "GBP",
  US: "USD",
};

const copyGlobalProductsToTenant = async (tenantId, country = 'US') => {
  try {
    console.log(`Copying global products to tenant ${tenantId} for country: ${country}`);
    
    // Get currency information
    const currency = countryToCurrencyMap[country] || "USD";
    const currencySymbol = currencyMap[currency] || "$";
    
    // Step 1: Copy all global categories to tenant
    const globalCategories = await db.queryAll(`
      SELECT categoryId, categoryName, description, categoryBanner 
      FROM tbl_categories_global
      ORDER BY categoryId
    `);

    if (globalCategories.length === 0) {
      return {
        success: false,
        error: "No global categories found"
      };
    }

    const categoryMapping = {};
    
    for (const category of globalCategories) {
      const existing = await db.query(
        'SELECT id FROM tbl_categories WHERE tenant_id = ? AND name = ?',
        [tenantId, category.categoryName]
      );

      if (existing) {
        categoryMapping[category.categoryId] = existing.id;
        console.log(`Reusing category: ${category.categoryName} (ID: ${existing.id})`);
      } else {
        const tenantCategoryData = {
          tenant_id: tenantId,
          name: category.categoryName,
          description: category.description || '',
          image_url: category.categoryBanner || null,
          status: 'active',
          created_at: new Date()
        };
        
        const result = await db.insert("tbl_categories", tenantCategoryData);
        categoryMapping[category.categoryId] = result.insert_id;
        console.log(`Created category: ${category.categoryName} (${category.categoryId} → ${result.insert_id})`);
      }
    }

    // Step 2: Get all global products with pricing for the specified country
    const globalProducts = await db.queryAll(`
      SELECT 
        p.id as global_product_id,
        p.productName,
        p.categoryId,
        p.description,
        p.fullDescription,
        p.keyIngredients,
        p.keyBenefits,
        p.cautions,
        p.fdaDisclaimer,
        p.patentsAndCertifications,
        p.directionsForUse,
        p.allergyInfo,
        p.freeOf,
        p.productImage,
        p.productBanners,
        p.productVideoLink,
        pp.country,
        pp.yourPrice,
        pp.basePrice,
        pp.preferredCustomerPrice,
        pp.currencySymbol
      FROM tbl_products_global p
      JOIN tbl_productpricing pp ON p.id = pp.productId
      WHERE pp.country = ?
      ORDER BY p.categoryId, p.productName
    `, [country]);

    console.log(`Found ${globalProducts.length} products for ${country}`);

    if (globalProducts.length === 0) {
      return { 
        success: false, 
        error: `No products found for country: ${country}` 
      };
    }

    // Step 3: Copy each product to tenant's products table
    let copiedCount = 0;
    let skippedCount = 0;
    
    for (const product of globalProducts) {
      if (!categoryMapping[product.categoryId]) {
        console.warn(`Skipping product ${product.productName} - category ${product.categoryId} not mapped`);
        skippedCount++;
        continue;
      }

      const tenantProductData = {
        tenant_id: tenantId,
        global_product_id: product.global_product_id,
        category_id: categoryMapping[product.categoryId],
        name: product.productName,
        title: product.productName,
        description: product.description || '',
        fullDescription: product.fullDescription || null,
        keyIngredients: product.keyIngredients || null,
        keyBenefits: product.keyBenefits || null,
        cautions: product.cautions || null,
        fdaDisclaimer: product.fdaDisclaimer || null,
        patentsAndCertifications: product.patentsAndCertifications || null,
        directionsForUse: product.directionsForUse || null,
        allergyInfo: product.allergyInfo || null,
        freeOf: product.freeOf || null,
        your_price: product.yourPrice || null,
        base_price: product.basePrice || null,
        preferred_customer_price: product.preferredCustomerPrice || null,
        country: country,
        currency: currency,
        currency_symbol: currencySymbol,
        status: 'active',
        availability: 'in_stock',
        image_url: product.productImage || null,
        banner_image_url: product.productBanners || null,
        productBanners: product.productBanners || null,
        instructions: product.directionsForUse || null,
        video_url: product.productVideoLink || null,
        productVideoLink: product.productVideoLink || null,
        buy_link: null,
        guide_pdf_url: null,
        is_visible: 1,
        created_at: new Date()
      };

      await db.insert("tbl_products", tenantProductData);
      copiedCount++;
    }

    console.log(`Successfully copied ${copiedCount} products, skipped ${skippedCount}`);
    
    return { 
      success: true, 
      products_count: copiedCount,
      categories_count: Object.keys(categoryMapping).length,
      skipped_count: skippedCount,
      country: country,
      currency: currency,
      currency_symbol: currencySymbol
    };

  } catch (error) {
    console.error('Error copying products to tenant:', error);
    return { 
      success: false, 
      error: error.message,
      stack: error.stack 
    };
  }
};

module.exports = { copyGlobalProductsToTenant };