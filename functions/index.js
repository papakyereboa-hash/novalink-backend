const functions = require("firebase-functions");
const axios = require("axios");
require("dotenv").config();

exports.buyData = functions.https.onRequest(async (req, res) => {
  try {
    // Allow only POST
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const { phone, variation_code, amount } = req.body;

    if (!phone || !variation_code || !amount) {
      return res.status(400).json({
        error: "phone, variation_code, and amount are required",
      });
    }

    const response = await axios.post(
      "https://sandbox.vtpass.com/api/pay",
      {
        serviceID: "mtn-data",
        billersCode: phone,
        variation_code: variation_code,
        amount: amount,
        phone: phone,
      },
      {
        headers: {
          "api-key": process.env.VT_PUBLIC_KEY,
          "secret-key": process.env.VT_SECRET_KEY,
        },
      }
    );

    res.json({
      success: true,
      data: response.data,
    });

  } catch (error) {
    console.error("ERROR:", error.response?.data || error.message);

    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});