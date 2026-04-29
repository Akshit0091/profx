require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");

const app  = express();
// Railway injects PORT automatically - must use process.env.PORT
const PORT = process.env.PORT || 5000;

console.log("Starting ProfX on port:", PORT);
console.log("NODE_ENV:", process.env.NODE_ENV);

if (process.env.NODE_ENV === "production") {
  try {
    const { execSync } = require("child_process");
    console.log("Running prisma generate...");
    execSync("node ./node_modules/prisma/build/index.js generate", { stdio: "inherit" });
    console.log("Running prisma db push...");
    execSync("node ./node_modules/prisma/build/index.js db push --accept-data-loss", { stdio: "inherit" });
    console.log("✅ Database ready");
  } catch (err) { console.error("Prisma setup error:", err.message); }
}

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:3000",
    "https://profx-two.vercel.app",
    "http://localhost:3000"
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth",      require("./routes/auth"));
app.use("/api/payment",   require("./routes/payment"));
app.use("/api/admin",     require("./routes/admin"));
app.use("/api/sku",       require("./routes/sku"));
app.use("/api/upload",    require("./routes/upload"));
app.use("/api/orders",    require("./routes/orders"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/reset",     require("./routes/reset"));

app.get("/api/health", (req, res) =>
  res.json({ status: "ok", app: "ProfX", version: "2.0", port: PORT, timestamp: new Date().toISOString() })
);

app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

// Must listen on 0.0.0.0 for Railway
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ ProfX v2.0 running on port ${PORT}`)
);
