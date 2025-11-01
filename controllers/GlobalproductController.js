const db = require('../config/db');

// Currency code to symbol mapping
const currencyMap = {
  USD: '$',     // US, Canada, Singapore
  EUR: '€',     // Austria, Belgium, Croatia, Cyprus, Estonia, Finland, France, Germany, Greece, Ireland, Italy, Malta, Netherlands, Portugal, Slovak Republic, Slovenia, Spain
  BOB: 'Bs.',   // Bolivia
  BGN: 'лв',    // Bulgaria
  CZK: 'Kč',    // Czech Republic
  DKK: 'kr',    // Denmark
  HUF: 'Ft',    // Hungary
  INR: '₹',     // India
  JPY: '¥',     // Japan
  MXN: 'MX$',   // Mexico
  NOK: 'kr',    // Norway
  PEN: 'S/.',   // Peru
  PLN: 'zł',    // Poland
  RON: 'lei',   // Romania
  RUB: '₽',     // Russia
  SEK: 'kr',    // Sweden
  GBP: '£',     // UK
  COP: '$'      // Colombia
};

// Country to currency code mapping
const countryToCurrencyMap = {
  'Austria': 'EUR',
  'Belgium': 'EUR',
  'Bolivia': 'BOB',
  'Bulgaria': 'BGN',
  'Canada': 'CAD', // Adjust to CAD if needed
  'Colombia': 'COP',
  'Croatia': 'EUR',
  'Cyprus': 'EUR',
  'Czech Republic': 'CZK',
  'Denmark': 'DKK',
  'Estonia': 'EUR',
  'Finland': 'EUR',
  'France': 'EUR',
  'Germany': 'EUR',
  'Greece': 'EUR',
  'Hungary': 'HUF',
  'India': 'INR',
  'Ireland': 'EUR',
  'Italy': 'EUR',
  'Japan': 'JPY',
  'Malta': 'EUR',
  'Mexico': 'MXN',
  'Netherlands': 'EUR',
  'Norway': 'NOK',
  'Peru': 'PEN',
  'Poland': 'PLN',
  'Portugal': 'EUR',
  'Romania': 'RON',
  'Russia': 'RUB',
  'Singapore': 'USD', // Adjust to SGD if needed
  'Slovak Republic': 'EUR',
  'Slovenia': 'EUR',
  'Spain': 'EUR',
  'Sweden': 'SEK',
  'UK': 'GBP',
  'US': 'USD'
};

// Get all categories
const getCategories = async (req, res) => {
  try {
    const categories = await db.selectAll('tbl_categories_global', 'categoryId, categoryName, description, categoryBanner');
    res.json({ status: true, data: categories });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Error fetching categories', error: err.message });
  }
};

// Get products by country and optional category
const getProducts = async (req, res) => {
  const country = req.query.country || 'US';
  const categoryName = req.query.categoryName;

  try {
    // Validate country
    const validCountries = await db.queryAll('SELECT DISTINCT country FROM tbl_productpricing');
    if (!validCountries.some(c => c.country === country)) {
      return res.status(400).json({ status: false, message: 'Invalid country' });
    }

   
    let query = `
  SELECT DISTINCT p.id, p.productName, c.categoryName, p.description, p.productImage, 
  p.productVideoLink,
         pp.country, pp.yourPrice, pp.basePrice, pp.preferredCustomerPrice
  FROM tbl_products_global p
  JOIN tbl_categories_global c ON p.categoryId = c.categoryId
  JOIN tbl_productpricing pp ON p.id = pp.productId
  WHERE pp.country = ?
`;
    const params = [country];

    if (categoryName) {
      query += ' AND c.categoryName = ?';
      params.push(categoryName);
    }

    const products = await db.queryAll(query, params);
    // Map products with correct currency and symbol
    const formattedProducts = products.map(product => ({
      ...product,
      currency: countryToCurrencyMap[country] || 'USD',
      currencySymbol: currencyMap[countryToCurrencyMap[country]] || '$'
    }));

    res.json({ status: true, data: formattedProducts, country });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Error fetching products', error: err.message });
  }
};

// Get single product details
const getProductDetail = async (req, res) => {
  const { id } = req.params;
  const country = req.query.country || 'US';

  try {
    // Validate country
    const validCountries = await db.queryAll('SELECT DISTINCT country FROM tbl_productpricing');
    if (!validCountries.some(c => c.country === country)) {
      return res.status(400).json({ status: false, message: 'Invalid country' });
    }

    const query = `
      SELECT p.id, p.productName, c.categoryName, p.description, p.fullDescription, 
             p.keyIngredients, p.keyBenefits, p.patentsAndCertifications, 
             p.directionsForUse, p.cautions, p.fdaDisclaimer, p.productImage, 
             p.productBanners,p.productVideoLink, pp.country, pp.yourPrice, pp.basePrice, 
             pp.preferredCustomerPrice
      FROM tbl_products_global p
      JOIN tbl_categories_global c ON p.categoryId = c.categoryId
      JOIN tbl_productpricing pp ON p.id = pp.productId
      WHERE p.id = ? AND pp.country = ?
    `;
    const product = await db.query(query, [id, country]);
    if (!product) {
      return res.status(404).json({ status: false, message: 'Product not found' });
    }
    // Map product with correct currency and symbol
    const formattedProduct = {
      ...product,
      currency: countryToCurrencyMap[country] || 'USD',
      currencySymbol: currencyMap[countryToCurrencyMap[country]] || '$'
    };

    res.json({ status: true, data: formattedProduct, country });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Error fetching product', error: err.message });
  }
};

// Get available countries
const getCountries = async (req, res) => {
  try {
    const countries = await db.queryAll('SELECT DISTINCT country FROM tbl_productpricing');
    res.json({ status: true, data: countries.map(c => c.country) });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Error fetching countries', error: err.message });
  }
};

module.exports = { getCategories, getProducts, getProductDetail, getCountries };