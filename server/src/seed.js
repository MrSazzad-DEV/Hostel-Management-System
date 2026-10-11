import "./config.js";
import bcrypt from "bcryptjs";
import pool, { initializeDatabase, withTransaction } from "./db.js";

try {
  await initializeDatabase();
  const production = process.env.NODE_ENV === "production";
  const adminEmail = production ? process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() : "admin@hostel.local";
  const adminName = production ? process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Hostel Administrator" : "Hostel Administrator";
  const adminPassword = production ? process.env.BOOTSTRAP_ADMIN_PASSWORD : "ChangeMe123!";

  if (!adminEmail || !adminPassword || (production && adminPassword.length < 16)) {
    throw new Error("Production seeding requires BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD of at least 16 characters.");
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const { rows: administrators } = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [adminName, adminEmail, passwordHash]
  );
  if (!production && administrators.length === 0) {
    console.log("The local demo administrator already exists; its password was not changed.");
  }

  if (production) {
    console.log(`Production database schema and administrator ${adminEmail} are ready.`);
  } else {
    const { rows: existingRooms } = await pool.query("SELECT COUNT(*)::int AS count FROM rooms");
    if (existingRooms[0].count === 0) {
      await pool.query(
        `INSERT INTO rooms (room_number, floor, room_type, monthly_rent, capacity)
         VALUES ('101', 1, 'Double', 8500, 2), ('102', 1, 'Single', 12000, 1),
                ('201', 2, 'Triple', 7000, 3), ('202', 2, 'Double', 8500, 2)`
      );
    }
    await pool.query(
      `INSERT INTO beds (room_id, bed_label)
       SELECT r.id, 'Bed ' || bed_number
       FROM rooms r CROSS JOIN LATERAL generate_series(1, r.capacity) AS series(bed_number)
       ON CONFLICT (room_id, bed_label) DO NOTHING`
    );
    const { rows: existingResidents } = await pool.query("SELECT COUNT(*)::int AS count FROM residents");
    if (existingResidents[0].count === 0) {
      await withTransaction(async (client) => {
        const { rows: residents } = await client.query(
          `INSERT INTO residents (full_name, email, phone, emergency_contact)
           VALUES ('Asha Rahman', 'asha@example.com', '+880 1712-345678', 'Nadia Rahman · +880 1812-345678'),
                  ('Tariq Hasan', 'tariq@example.com', '+880 1812-987654', 'Imran Hasan · +880 1912-987654'),
                  ('Mina Akter', 'mina@example.com', '+880 1912-246810', 'Rina Akter · +880 1712-246810')
           RETURNING id, email`
        );
        const roomBeds = [
          ["asha@example.com", "101", "Bed 1"],
          ["tariq@example.com", "101", "Bed 2"],
          ["mina@example.com", "201", "Bed 1"]
        ];
        for (const [email, roomNumber, bedLabel] of roomBeds) {
          const resident = residents.find((item) => item.email === email);
          await client.query(
            `INSERT INTO allocations (resident_id, bed_id)
             SELECT $1, b.id FROM beds b JOIN rooms r ON r.id = b.room_id
             WHERE r.room_number = $2 AND b.bed_label = $3`,
            [resident.id, roomNumber, bedLabel]
          );
        }
        const asha = residents.find((resident) => resident.email === "asha@example.com");
        const tariq = residents.find((resident) => resident.email === "tariq@example.com");
        await client.query(
          `INSERT INTO payments (resident_id, amount, due_date, status, paid_at, payment_method, reference)
           VALUES ($1, 8500, date_trunc('month', CURRENT_DATE)::date, 'paid', CURRENT_TIMESTAMP, 'bank_transfer', 'DEMO-1001'),
                  ($2, 8500, date_trunc('month', CURRENT_DATE)::date, 'pending', NULL, 'cash', NULL)`,
          [asha.id, tariq.id]
        );
        await client.query(
          `INSERT INTO maintenance_tickets (room_id, resident_id, title, description, priority)
           SELECT r.id, $1, 'Kitchen tap needs a look', 'The cold water tap is dripping and could use a quick repair.', 'medium'
           FROM rooms r WHERE r.room_number = '101'`,
          [asha.id]
        );
      });
    }
    console.log("Local development data is ready.");
  }
} catch (error) {
  console.error("Database seeding failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
