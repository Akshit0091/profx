require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 5000;

console.log(`Starting ProfX on port: ${PORT}`);

app.use(cors({
  origin: "*",
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
  res.json({ status: "ok", app: "ProfX", version: "2.0", timestamp: new Date().toISOString() })
);

app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ ProfX v2.0 running on port ${PORT}`)
);
