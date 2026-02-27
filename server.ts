import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import multer from "multer";
import mongoose from "mongoose";

const app = express();
const PORT = 3000;

// MongoDB Connection with Fallback
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/trafficguard";
let isMongoConnected = false;
let inMemoryDetections: any[] = [];

mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log("Connected to MongoDB");
    isMongoConnected = true;
  })
  .catch(err => {
    console.error("MongoDB connection error (falling back to in-memory):", err.message);
    isMongoConnected = false;
  });

const detectionSchema = new mongoose.Schema({
  filename: String,
  url: String,
  results: Array,
  timestamp: { type: Date, default: Date.now }
});

const Detection = mongoose.model("Detection", detectionSchema);

// Setup storage for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

const UPLOAD_DIR = path.resolve(process.cwd(), "public", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Middleware
app.use(express.json());
app.use("/uploads", express.static(UPLOAD_DIR));

// API Routes
app.get("/api/detections", async (req, res) => {
  try {
    if (isMongoConnected) {
      const detections = await Detection.find().sort({ timestamp: -1 });
      return res.json(detections.map(d => ({
        id: d._id,
        filename: d.filename,
        url: d.url,
        results: d.results,
        timestamp: d.timestamp
      })));
    } else {
      return res.json(inMemoryDetections);
    }
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ error: "Failed to fetch detections" });
  }
});

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  res.json({
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
  });
});

app.post("/api/detections", async (req, res) => {
  const { filename, url, results } = req.body;
  
  try {
    const detectionData = {
      filename,
      url,
      results: results || [],
      timestamp: new Date().toISOString()
    };

    if (isMongoConnected) {
      const newDetection = new Detection(detectionData);
      const saved = await newDetection.save();
      res.json({
        id: saved._id,
        filename: saved.filename,
        url: saved.url,
        results: saved.results,
        timestamp: saved.timestamp
      });
    } else {
      const record = { ...detectionData, id: Date.now().toString() };
      inMemoryDetections.unshift(record);
      res.json(record);
    }
  } catch (err) {
    console.error("Save error:", err);
    res.status(500).json({ error: "Failed to save detection" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
