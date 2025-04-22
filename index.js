// const express = require("express");
// const app = express();
// const PORT = 3001;
// const path = require("path");
// const cors = require("cors");

// const tenantRoutes = require("./routes/tenantRoutes");
// const adminRoutes = require("./routes/adminRoutes");
// const userRoutes = require("./routes/userRoutes");
// const templateRoutes = require("./routes/templateRoutes");
// const publicTenantRoutes  = require("./routes/publicTenantRoutes")
// const newsletterRoutes = require("./routes/newsletterRoutes"); 

// const allowedOrigins = [
//   "http://localhost:5173", // Development
//   "http://stage.begrat.com", // Stage
//   "https://begrat.com" // Production (optional)
// ];

// app.use(cors({
//   origin: (origin, callback) => {
//     if (!origin || allowedOrigins.indexOf(origin) !== -1) {
//       callback(null, true);
//     } else {
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true
// }));

// app.use(express.json());
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// // ✅ Routes
// app.use("/api/users", userRoutes);
// app.use("/api/admin", adminRoutes);
// app.use("/api/tenants", tenantRoutes);
// app.use("/api/templates", templateRoutes);
// app.use("/api/newsletters", newsletterRoutes); 
// app.use("/api", publicTenantRoutes);



// // ✅ Error handler for JSON parsing
// app.use((err, req, res, next) => {
//   if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
//     console.error("Invalid JSON payload:", err.message);
//     return res.status(400).json({
//       error: "INVALID_JSON",
//       message: "Invalid JSON format in request body",
//     });
//   }
//   next(err);
// });

// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });


const express = require("express");
const app = express();
require('dotenv').config(); // Load .env
const PORT = process.env.PORT || 3001;
const path = require("path");
const cors = require("cors");

const tenantRoutes = require("./routes/tenantRoutes");
const adminRoutes = require("./routes/adminRoutes");
const userRoutes = require("./routes/userRoutes");
const templateRoutes = require("./routes/templateRoutes");
const publicTenantRoutes = require("./routes/publicTenantRoutes");
const newsletterRoutes = require("./routes/newsletterRoutes");

const allowedOrigins = [
  "http://localhost:5173", // Development
  "http://stage.begrat.com", // Stage
  "http://begrat.com" // Production
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "Uploads")));

// Routes
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/newsletters", newsletterRoutes);
app.use("/api", publicTenantRoutes);

// Custom domain and slug routing
app.get('*', async (req, res, next) => {
  const host = req.headers.host.split(':')[0];
  const db = require('./database');
  
  // Check if request is for a custom domain
  const tenantByDomain = await db.select('tbl_tenants', '*', 'domain = ?', [host]);
  if (tenantByDomain) {
    const { createProxyMiddleware } = require('http-proxy-middleware');
    const proxy = createProxyMiddleware({
      target: process.env.NODE_ENV === 'production' ? 'https://begrat.com' : 'http://localhost:5173',
      changeOrigin: true,
      pathRewrite: { '^/': `/${tenantByDomain.slug}/` },
    });
    return proxy(req, res, next);
  }

  // Check if request is for a slug
  const pathParts = req.path.split('/').filter(Boolean);
  const slug = pathParts[0] || '';
  const tenantBySlug = await db.select('tbl_tenants', '*', 'slug = ?', [slug]);
  if (tenantBySlug) {
    const { createProxyMiddleware } = require('http-proxy-middleware');
    const proxy = createProxyMiddleware({
      target: process.env.NODE_ENV === 'production' ? 'https://begrat.com' : 'http://localhost:5173',
      changeOrigin: true,
    });
    return proxy(req, res, next);
  }

  res.status(404).send('Tenant not found');
});

// Error handler for JSON parsing
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    console.error("Invalid JSON payload:", err.message);
    return res.status(400).json({
      error: "INVALID_JSON",
      message: "Invalid JSON format in request body",
    });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});