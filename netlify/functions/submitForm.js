const admin = require("firebase-admin");
const { z } = require("zod");

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

// Define strict input validation schema
const formSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z\s.]+$/, "Name must be alphabetic"),
  email: z.string().email(),
  message: z.string().max(1000),
  captchaToken: z.string().optional(), // If using CAPTCHA (e.g., reCAPTCHA v2)
});

// Sanitize string inputs (basic)
function sanitizeInput(input) {
  const clean = {};
  for (const key in input) {
    if (typeof input[key] === "string") {
      clean[key] = input[key].replace(/[<>]/g, "").trim(); // Strip HTML tags
    } else {
      clean[key] = input[key];
    }
  }
  return clean;
}

// Optional: Validate CAPTCHA (e.g., Google reCAPTCHA)
async function validateCaptcha(token) {
  if (!token) return false;
  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`,
  });
  const data = await res.json();
  return data.success;
}

// Handler
exports.handler = async function (event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Only POST requests are allowed" };
  }

  try {
    const rawData = JSON.parse(event.body);
    const sanitized = sanitizeInput(rawData);
    const parsedData = formSchema.parse(sanitized);

    // Optional: CAPTCHA check
    const isHuman = await validateCaptcha(parsedData.captchaToken);
    if (!isHuman) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "CAPTCHA verification failed" }),
      };
    }

    // Save to Firestore
    await db.collection("orders").add({
      ...parsedData,
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Success" }),
    };
  } catch (err) {
    console.error("Form submission failed:", err.message);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid submission or server error" }),
    };
  }
};
