const axios = require('axios');

// Short in-memory TTL cache by IP to avoid repeated external lookups
const countryCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1000;

const getCachedCountry = (ip) => {
  const entry = countryCache.get(ip);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    countryCache.delete(ip);
    return null;
  }
  return entry.country;
};

const setCachedCountry = (ip, country) => {
  if (countryCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = countryCache.keys().next().value;
    countryCache.delete(firstKey);
  }
  countryCache.set(ip, { country, ts: Date.now() });
};

const detectCountry = async (req, res, next) => {
  let country = req.query.country || 'US';

  if (!req.query.country) {
    try {
      const ip = req.ip === '::1' || req.ip === '127.0.0.1' ? '8.8.8.8' : req.ip;
      const cached = getCachedCountry(ip);
      if (cached) {
        country = cached;
      } else {
        const response = await axios.get(`https://ipwho.is/${ip}`, { timeout: 3000 });
        if (response.data && response.data.success && response.data.country_code) {
          country = response.data.country_code;
          setCachedCountry(ip, country);
        }
      }
    } catch (err) {
      console.error('Country detection failed:', err.message);
    }
  }

  req.detectedCountry = country;
  next();
};

module.exports = detectCountry;
