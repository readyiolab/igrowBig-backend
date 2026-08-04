require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET === "123456" || JWT_SECRET.length < 16) {
  console.error(
    "FATAL: JWT_SECRET must be set in the environment and be at least 16 characters (not the default weak value)."
  );
  process.exit(1);
}

module.exports = { JWT_SECRET };
