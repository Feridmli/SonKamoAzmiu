import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { nanoid } from 'nanoid';
import postgres from 'postgres';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

// -----------------------
// 🔌 DATABASE CONNECT
// -----------------------
const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:kamoazmiu123@db.xynzybjtfbhtxdnzvccn.supabase.co:5432/postgres";

const sql = postgres(connectionString, {
  ssl: { rejectUnauthorized: false }
});

// -----------------------
// 🚀 EXPRESS INIT
// -----------------------
const app = express();
const PORT = process.env.PORT || 3000;

// security middlewares
app.use(helmet({
  crossOriginResourcePolicy: false
}));

// JSON config
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// -----------------------
// 🌐 CORS CONFIG (DÜZGÜN)
// -----------------------
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// -----------------------
// 📁 PATH SETUP
// -----------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------
// 🔧 ENV CONSTANTS
// -----------------------
const NFT_CONTRACT_ADDRESS =
  process.env.NFT_CONTRACT_ADDRESS ||
  "0x54a88333F6e7540eA982261301309048aC431eD5";

const SEAPORT_CONTRACT_ADDRESS =
  process.env.SEAPORT_CONTRACT_ADDRESS ||
  "0x0000000000000068F116a894984e2DB1123eB395";

// -----------------------
// 🖥️ STATIC FRONTEND
// -----------------------
const distPath = path.join(__dirname, "dist");

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
} else {
  app.use(express.static(__dirname));
}

app.get("/", (req, res) => {
  const indexFile = fs.existsSync(path.join(distPath, "index.html"))
    ? path.join(distPath, "index.html")
    : path.join(__dirname, "index.html");

  res.sendFile(indexFile);
});

// -----------------------
// 📡 STATUS ENDPOINT
// -----------------------
app.get("/api/status", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});


// ======================================================
//            🔥  DÜZGÜN API ROUTE-LAR                //
// ======================================================


// -----------------------
// 📌 1) CREATE / UPSERT ORDER  (Sync script üçün)
// -----------------------
app.post("/api/order", async (req, res) => {
  try {
    const { tokenId, price, sellerAddress, seaportOrder, orderHash, image } =
      req.body;

    if (!tokenId || (!price && price !== 0) || !sellerAddress || !seaportOrder) {
      return res.status(400).json({
        success: false,
        error: "Missing parameters"
      });
    }

    const id = nanoid();
    const createdAt = new Date().toISOString();
    const seaportOrderJSON =
      typeof seaportOrder === "string"
        ? seaportOrder
        : JSON.stringify(seaportOrder);

    await sql`
      INSERT INTO orders (
        id, tokenId, price, nftContract, marketplaceContract,
        seller, seaportOrder, orderHash, onChain,
        status, image, createdAt
      )
      VALUES (
        ${id}, ${tokenId.toString()}, ${price},
        ${NFT_CONTRACT_ADDRESS}, ${SEAPORT_CONTRACT_ADDRESS},
        ${sellerAddress.toLowerCase()}, ${seaportOrderJSON}, ${orderHash || null},
        FALSE, 'active', ${image || null}, ${createdAt}
      )
      ON CONFLICT (orderHash)
      DO UPDATE SET
        price = EXCLUDED.price,
        seaportOrder = EXCLUDED.seaportOrder,
        status = 'active',
        updatedAt = NOW();
    `;

    res.json({
      success: true,
      order: { id, tokenId, price, seller: sellerAddress, createdAt }
    });
  } catch (err) {
    console.error("POST /api/order error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});


// -----------------------
// 📌 2) GET ALL ORDERS  (Frontend üçün əsas route)
// -----------------------
app.get("/api/orders", async (req, res) => {
  try {
    const rows = await sql`
      SELECT * FROM orders
      WHERE status = 'active'
      ORDER BY "createdAt" DESC
      LIMIT 500
    `;

    const orders = rows.map((r) => {
      const copy = { ...r };
      try {
        if (copy.seaportOrder) {
          copy.seaportOrder =
            typeof copy.seaportOrder === "string"
              ? JSON.parse(copy.seaportOrder)
              : copy.seaportOrder;
        }
      } catch {}
      return copy;
    });

    res.json({ success: true, orders });
  } catch (err) {
    console.error("GET /api/orders error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});


// -----------------------
// 📌 3) BUY CALLBACK
// -----------------------
app.post("/api/buy", async (req, res) => {
  try {
    const { orderHash, buyerAddress } = req.body;

    if (!orderHash || !buyerAddress) {
      return res.status(400).json({
        success: false,
        error: "Missing orderHash or buyerAddress"
      });
    }

    const updated = await sql`
      UPDATE orders
      SET onChain = TRUE,
          buyerAddress = ${buyerAddress.toLowerCase()},
          status = 'sold',
          updatedAt = NOW()
      WHERE orderHash = ${orderHash}
      RETURNING *;
    `;

    if (!updated || updated.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Order not found"
      });
    }

    res.json({ success: true, order: updated[0] });
  } catch (err) {
    console.error("POST /api/buy error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});


// -----------------------
// 🚀 START SERVER
// -----------------------
app.listen(PORT, () => {
  console.log(`🚀 Backend ${PORT}-də işləyir`);
});
