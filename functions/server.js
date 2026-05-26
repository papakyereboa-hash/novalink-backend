const axios = require("axios");
const bcrypt = require("bcrypt");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// TEST ROUTE
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
  ssl: {
    rejectUnauthorized: false
  }
});

// GET PLANS
app.get("/api/plans", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM mtn_plans");
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

    res.status(500).send("Error fetching RemaData bundles");
  }
});

// BUY DATA
app.post("/api/buy-data", async (req, res) => {

  try {

    console.log("REQUEST RECEIVED");
    console.log(req.body);

    const { phone, volumeInMB } = req.body;

    console.log("PHONE:", phone);
    console.log("VOLUME:", volumeInMB);

    const payload = {
      phone: phone,
      volumeInMB: volumeInMB,
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

// START SERVER
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});