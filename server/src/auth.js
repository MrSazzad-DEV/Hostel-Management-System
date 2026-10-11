import pool from "./db.js";
import jwt from "jsonwebtoken";

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Sign in to continue." });

  let user;
  try {
    user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Your session is invalid or expired. Please sign in again." });
  }

  try {
    const { rows } = await pool.query(
      "SELECT session_version FROM users WHERE id = $1 AND is_active = true",
      [user.sub]
    );
    if (!rows[0] || rows[0].session_version !== user.sessionVersion) {
      return res.status(401).json({ error: "Your session has expired. Please sign in again." });
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
