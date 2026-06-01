require("dotenv").config();

const axios = require("axios");
const bcrypt = require("bcrypt");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const { v4: uuidv4 } = require("uuid");

const app = express();

// RATE LIMITER
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: "Too many requests. Please try again later."
  }
});

// SECURITY MIDDLEWARE
app.use(
  cors({
    origin: ["https://papakyereboa-hash.github.io"],
    methods: ["GET", "POST"],
    credentials: true
  })
);

app.use(limiter);

app.use(helmet());

app.use(express.json());

// HEALTH ROUTES
app.get("/health", (req, res) => {
  res.send("Server is healthy");
});

app.get("/", (req, res) => {
  res.send("Backend is running");
});

// DATABASE CONNECTION
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// GET PLANS
app.get("/api/plans", async (req, res) => {
  try {

    const result = await pool.query(
      "SELECT * FROM mtn_plans"
    );

    res.json(result.rows);

  } catch (err) {

    console.error(err);

    res.status(500).send("Error fetching plans");
  }
});

// CREATE USER
app.post("/api/users", async (req, res) => {

  try {

    const { email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
      [email, hashedPassword]
    );

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);

    res.status(500).send("Error creating user");
  }
});

// GET REMADATA BUNDLES
app.get("/api/remadata-bundles", async (req, res) => {
  try {
    const response = await axios.get(
      "https://remadata.com/api/bundles?network=mtn",
      {
        headers: {
          "X-API-KEY": process.env.REMA_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);

    res.status(500).send(
      "Error fetching RemaData bundles"
    );
  }
});

// INITIALIZE PAYSTACK PAYMENT
app.post("/api/paystack/initialize", async (req, res) => {
  try {
    const { email, amount, phone, volumeInMB } = req.body;

    if (!email || !amount || !phone || !volumeInMB) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    const reference = `NL-${uuidv4()}`;

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: amount * 100,
        reference,
        metadata: {
          phone,
          volumeInMB
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({
      success: true,
      data: response.data.data
    });

  } catch (err) {
    console.log(err.response?.data || err.message);

    res.status(500).json({
      success: false,
      message: "Payment initialization failed"
    });
  }
});

// BUY DATA
app.post("/api/buy-data", async (req, res) => {
  try {
    console.log("REQUEST RECEIVED");
    console.log(req.body);

    const {
  phone,
  volumeInMB,
  bundle,
  amount,
  reference
} = req.body;

    if (!phone || !volumeInMB) {
      return res.status(400).json({
        success: false,
        message: "Phone and volume are required"
      });
    }

    const cleanPhone = phone.toString().trim();

    const ghanaPhoneRegex = /^0\d{9}$/;

    if (!ghanaPhoneRegex.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Ghana phone number"
      });
    }

    if (isNaN(volumeInMB)) {
      return res.status(400).json({
        success: false,
        message: "Invalid volume"
      });
    }

    console.log("PHONE:", phone);
    console.log("VOLUME:", volumeInMB);

    const payload = {
      phone,
      volumeInMB,
      networkType: "mtn"
    };

    console.log("SENDING TO REMADATA:");
    console.log(payload);

    const response = await axios.post(
      "https://remadata.com/api/buy-data",
      payload,
      {
        headers: {
          "X-API-KEY": process.env.REMA_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("REMADATA RESPONSE:");
console.log(response.data);

console.log("ABOUT TO SAVE ORDER");

/* SAVE ORDER */

await pool.query(
  `
  INSERT INTO orders
  (
    phone,
    bundle,
    amount,
    reference,
    status
  )
  VALUES
  (
    $1,$2,$3,$4,$5
  )
  `,
  [
    phone,
    bundle,
    amount,
    reference,
    "SUCCESS"
  ]
);

console.log("ORDER SAVED");

res.json(response.data);
res.json(response.data);

  } catch (err) {
    console.log("FULL ERROR:");
    console.log(err.response?.data || err.message);

    res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
});

// CHECK ORDER STATUS
app.get("/api/check-order/:ref", async (req, res) => {
  try {
    console.log("CHECK ORDER REQUEST RECEIVED");

    const ref = req.params.ref;

    const response = await axios.get(
      `https://remadata.com/api/order-status/${ref}`,
      {
        headers: {
          "X-API-KEY": process.env.REMA_API_KEY
        }
      }
    );

    res.json(response.data);

  } catch (err) {
    console.log(err.response?.data || err.message);

    res.status(500).send("Error checking order");
  }
});


// TRACK ORDER
app.get("/api/track-order", async (req, res) => {
  try {

    const { phone, date } = req.query;

    if (!phone || !date) {
      return res.status(400).json({
        success: false,
        message: "Phone and date required"
      });
    }

    const result = await pool.query(
      `
      SELECT *
      FROM orders
      WHERE phone = $1
      AND DATE(created_at) = $2
      ORDER BY created_at DESC
      `,
      [phone, date]
    );

    res.json({
      success: true,
      orders: result.rows
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Failed to fetch orders"
    });
  }
});


// START SERVER
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});