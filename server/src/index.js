import "./config.js";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pool, { initializeDatabase, withTransaction } from "./db.js";
import { requireAuth } from "./auth.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const clientBuild = fileURLToPath(new URL("../../client/dist/", import.meta.url));
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please wait 15 minutes and try again." }
});

app.disable("x-powered-by");
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      upgradeInsecureRequests: []
    }
  } : false
}));
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  if (req.body === null || Array.isArray(req.body) || (req.body !== undefined && typeof req.body !== "object")) {
    return res.status(400).json({ error: "Request body must be a JSON object." });
  }
  if (req.body === undefined) req.body = {};
  next();
});

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ error: "Database is unavailable." });
  }
});

app.post("/api/auth/login", loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const { rows } = await pool.query(
      "SELECT id, full_name, email, password_hash, role, session_version FROM users WHERE email = $1 AND is_active = true",
      [email]
    );
    if (!rows[0] || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    const user = rows[0];
    const token = jwt.sign(
      { sub: user.id, name: user.full_name, role: user.role, sessionVersion: user.session_version },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );
    res.json({
      token,
      user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role }
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api", requireAuth);

app.get("/api/auth/me", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, full_name, email, role FROM users WHERE id = $1 AND is_active = true",
      [req.user.sub]
    );
    if (!rows[0]) return res.status(401).json({ error: "User account is unavailable." });
    const user = rows[0];
    res.json({ id: user.id, fullName: user.full_name, email: user.email, role: user.role });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/change-password", async (req, res, next) => {
  const currentPassword = typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword : "";

  if (newPassword.length < 16) {
    return res.status(400).json({ error: "Your new password must contain at least 16 characters." });
  }

  try {
    const { rows } = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1 AND is_active = true",
      [req.user.sub]
    );
    if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      return res.status(401).json({ error: "Your current password is incorrect." });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const { rows: updatedUsers } = await pool.query(
      `UPDATE users SET password_hash = $2, session_version = session_version + 1
       WHERE id = $1 AND is_active = true
       RETURNING session_version`,
      [req.user.sub, passwordHash]
    );
    if (!updatedUsers[0]) return res.status(401).json({ error: "User account is unavailable." });
    const token = jwt.sign(
      { sub: req.user.sub, name: req.user.name, role: req.user.role, sessionVersion: updatedUsers[0].session_version },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );
    res.json({ message: "Password changed successfully.", token });
  } catch (error) {
    next(error);
  }
});

app.get("/api/dashboard", async (_req, res, next) => {
  try {
    const [occupancy, residents, fees, maintenance, recent] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total_beds,
                COUNT(*) FILTER (WHERE a.id IS NOT NULL)::int AS occupied_beds
         FROM beds b LEFT JOIN LATERAL (
           SELECT id FROM allocations WHERE bed_id = b.id AND status = 'active'
         ) a ON true`
      ),
      pool.query("SELECT COUNT(*)::int AS count FROM residents WHERE status = 'active'"),
      pool.query(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND paid_at >= date_trunc('month', CURRENT_DATE)), 0)::numeric AS collected,
                COALESCE(SUM(amount) FILTER (WHERE status IN ('pending', 'overdue')), 0)::numeric AS outstanding
         FROM payments`
      ),
      pool.query("SELECT COUNT(*)::int AS count FROM maintenance_tickets WHERE status <> 'resolved'"),
      pool.query(
        `SELECT r.id, r.full_name, r.email, r.phone, r.status, rm.room_number,
                p.amount AS latest_payment, p.status AS payment_status
         FROM residents r
         LEFT JOIN LATERAL (
           SELECT bed_id FROM allocations WHERE resident_id = r.id AND status = 'active' LIMIT 1
         ) a ON true
         LEFT JOIN beds b ON b.id = a.bed_id
         LEFT JOIN rooms rm ON rm.id = b.room_id
         LEFT JOIN LATERAL (
           SELECT amount, status FROM payments WHERE resident_id = r.id ORDER BY due_date DESC LIMIT 1
         ) p ON true
         ORDER BY r.created_at DESC LIMIT 6`
      )
    ]);
    res.json({
      totalBeds: occupancy.rows[0].total_beds,
      occupiedBeds: occupancy.rows[0].occupied_beds,
      activeResidents: residents.rows[0].count,
      collectedThisMonth: Number(fees.rows[0].collected),
      outstandingFees: Number(fees.rows[0].outstanding),
      openMaintenance: maintenance.rows[0].count,
      recentResidents: recent.rows
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/rooms", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.room_number, r.floor, r.room_type, r.monthly_rent, r.capacity, r.created_at,
              COUNT(b.id)::int AS bed_count,
              COUNT(a.id)::int AS occupied_beds
       FROM rooms r
       LEFT JOIN beds b ON b.room_id = r.id
       LEFT JOIN allocations a ON a.bed_id = b.id AND a.status = 'active'
       GROUP BY r.id ORDER BY r.floor, r.room_number`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/rooms", async (req, res, next) => {
  const { roomNumber, floor, roomType, monthlyRent, capacity } = req.body;
  const floorNumber = floor === "" || floor == null ? 1 : Number(floor);
  if (typeof roomNumber !== "string" || !roomNumber.trim() ||
      typeof roomType !== "string" || !roomType.trim() ||
      !Number.isInteger(floorNumber) || floorNumber < 0 ||
      !Number.isInteger(Number(capacity)) || Number(capacity) < 1 ||
      Number(capacity) > 12 || !Number.isFinite(Number(monthlyRent)) || Number(monthlyRent) <= 0) {
    return res.status(400).json({ error: "Provide a room number, type, positive rent, and capacity from 1 to 12." });
  }
  try {
    const room = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO rooms (room_number, floor, room_type, monthly_rent, capacity)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [roomNumber.trim(), floorNumber, roomType.trim(), Number(monthlyRent), Number(capacity)]
      );
      await client.query(
        "INSERT INTO beds (room_id, bed_label) SELECT $1, 'Bed ' || bed_number FROM generate_series(1, $2) AS series(bed_number)",
        [rows[0].id, Number(capacity)]
      );
      return rows[0];
    });
    res.status(201).json(room);
  } catch (error) {
    next(error);
  }
});

app.get("/api/beds/available", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.bed_label, r.room_number, r.monthly_rent
       FROM beds b JOIN rooms r ON r.id = b.room_id
       WHERE NOT EXISTS (SELECT 1 FROM allocations a WHERE a.bed_id = b.id AND a.status = 'active')
       ORDER BY r.floor, r.room_number, b.bed_label`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/residents", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.full_name, r.email, r.phone, r.emergency_contact, r.joined_on, r.status,
              rm.room_number, b.bed_label
       FROM residents r
       LEFT JOIN allocations a ON a.resident_id = r.id AND a.status = 'active'
       LEFT JOIN beds b ON b.id = a.bed_id
       LEFT JOIN rooms rm ON rm.id = b.room_id
       ORDER BY r.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/residents", async (req, res, next) => {
  const { fullName, email, phone, emergencyContact, bedId } = req.body;
  if (typeof fullName !== "string" || !fullName.trim() ||
      typeof email !== "string" || !email.trim() ||
      typeof phone !== "string" || !phone.trim() ||
      (emergencyContact != null && typeof emergencyContact !== "string")) {
    return res.status(400).json({ error: "Full name, email, and phone are required." });
  }
  try {
    const resident = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO residents (full_name, email, phone, emergency_contact)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [fullName.trim(), email.trim().toLowerCase(), phone.trim(), emergencyContact?.trim() || null]
      );
      if (bedId) {
        await client.query(
          "INSERT INTO allocations (resident_id, bed_id) VALUES ($1, $2)",
          [rows[0].id, bedId]
        );
      }
      return rows[0];
    });
    res.status(201).json(resident);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/residents/:id/check-out", async (req, res, next) => {
  try {
    const resident = await withTransaction(async (client) => {
      const { rows } = await client.query(
        "UPDATE residents SET status = 'inactive' WHERE id = $1 AND status = 'active' RETURNING id",
        [req.params.id]
      );
      if (!rows[0]) return null;
      await client.query(
        `UPDATE allocations SET status = 'ended', end_date = CURRENT_DATE
         WHERE resident_id = $1 AND status = 'active'`,
        [rows[0].id]
      );
      return rows[0];
    });
    if (!resident) return res.status(404).json({ error: "Active resident not found." });
    res.json({ message: "Resident checked out successfully." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/payments", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.amount, p.due_date, p.paid_at, p.status, p.payment_method, p.reference,
              r.id AS resident_id, r.full_name AS resident_name, r.email
       FROM payments p JOIN residents r ON r.id = p.resident_id
       ORDER BY p.due_date DESC, p.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/payments", async (req, res, next) => {
  const { residentId, amount, dueDate, paymentMethod, reference, status } = req.body;
  const parsedDueDate = new Date(`${dueDate}T00:00:00.000Z`);
  if (!residentId || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: "Select a resident and provide a positive amount." });
  }
  if (typeof dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
      Number.isNaN(parsedDueDate.getTime()) || parsedDueDate.toISOString().slice(0, 10) !== dueDate) {
    return res.status(400).json({ error: "Due date must be a valid date in YYYY-MM-DD format." });
  }
  if (status && !["paid", "pending"].includes(status)) {
    return res.status(400).json({ error: "Payment status must be paid or pending." });
  }
  if (paymentMethod && !["cash", "bank_transfer", "card", "mobile_money"].includes(paymentMethod)) {
    return res.status(400).json({ error: "Choose a supported payment method." });
  }
  if (reference != null && typeof reference !== "string") {
    return res.status(400).json({ error: "Payment reference must be text." });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO payments (resident_id, amount, due_date, status, paid_at, payment_method, reference)
       VALUES ($1, $2, $3, $4, CASE WHEN $4 = 'paid' THEN CURRENT_TIMESTAMP ELSE NULL END, $5, $6) RETURNING *`,
      [residentId, Number(amount), dueDate, status || "paid", paymentMethod || "cash", reference?.trim() || null]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/payments/:id/mark-paid", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE payments SET status = 'paid', paid_at = CURRENT_TIMESTAMP,
                           payment_method = COALESCE($2, payment_method)
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [req.params.id, req.body.paymentMethod || null]
    );
    if (!rows[0]) return res.status(404).json({ error: "Pending payment not found." });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get("/api/maintenance", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.description, t.priority, t.status, t.created_at,
              rm.room_number, r.full_name AS resident_name
       FROM maintenance_tickets t
       LEFT JOIN rooms rm ON rm.id = t.room_id
       LEFT JOIN residents r ON r.id = t.resident_id
       ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                t.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/maintenance", async (req, res, next) => {
  const { title, description, priority, roomId, residentId } = req.body;
  if (typeof title !== "string" || !title.trim() ||
      typeof description !== "string" || !description.trim()) {
    return res.status(400).json({ error: "A title and description are required." });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO maintenance_tickets (title, description, priority, room_id, resident_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title.trim(), description.trim(), ["low", "medium", "high"].includes(priority) ? priority : "medium", roomId || null, residentId || null]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/maintenance/:id/status", async (req, res, next) => {
  const { status } = req.body;
  if (!["open", "in_progress", "resolved"].includes(status)) {
    return res.status(400).json({ error: "Status must be open, in_progress, or resolved." });
  }
  try {
    const { rows } = await pool.query(
      "UPDATE maintenance_tickets SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
      [req.params.id, status]
    );
    if (!rows[0]) return res.status(404).json({ error: "Maintenance ticket not found." });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found." });
});

if (process.env.SERVE_CLIENT === "true") {
  app.use(express.static(clientBuild, { index: "index.html", maxAge: "1h" }));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(clientBuild, "index.html"));
  });
}

app.use((error, _req, res, _next) => {
  if (error.type === "entity.parse.failed") return res.status(400).json({ error: "Request body must be valid JSON." });
  if (error.code === "23505") return res.status(409).json({ error: "That email or room number is already in use." });
  if (error.code === "23503") return res.status(409).json({ error: "The selected resident, room, or bed is no longer available." });
  if (error.code === "23514") return res.status(400).json({ error: "The supplied value is not allowed." });
  console.error(error);
  res.status(500).json({ error: "The request could not be completed." });
});

try {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 ||
      process.env.JWT_SECRET === "replace-this-with-a-long-random-secret") {
    throw new Error("Set JWT_SECRET to a unique random value of at least 32 characters.");
  }
  await initializeDatabase();
  const host = process.env.HOST || "0.0.0.0";
  app.listen(port, host, () => console.log(`Hostel application listening on http://${host}:${port}`));
} catch (error) {
  console.error("Could not start the API:", error.message);
  process.exitCode = 1;
}
