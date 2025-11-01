const axios = require('axios');

const detectCountry = async (req, res, next) => {
  let country = req.query.country || req.session?.country || 'US';

  if (!req.session?.country) {
    try {
      const ip = req.ip === '::1' ? '8.8.8.8' : req.ip; // fallback for localhost
      const response = await axios.get(`https://ipwho.is/${ip}`);
      
      if (response.data && response.data.success && response.data.country_code) {
        country = response.data.country_code; // e.g., 'IN'
        req.session.country = country;
      }
    } catch (err) {
      console.error('Country detection failed:', err.message);
    }
  }

  req.detectedCountry = country;
  next();
};

module.exports = detectCountry;
