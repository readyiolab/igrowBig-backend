require('dotenv').config();

module.exports = {
  dbHost: process.env.DB_HOST,
  dbUser: process.env.DB_USER,
  dbPass: process.env.DB_PASS,
  dbName: process.env.DB_NAME,
  jwtSecret: process.env.JWT_SECRET,
  port: process.env.PORT || 5000,
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
};