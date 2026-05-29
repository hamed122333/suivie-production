require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const COMMERCIALS = [
  { name: 'Newbox Tunisia',       email: 'admin@newbox.tn',          password: 'Admin@123',  id: 'VL000001' },
  { name: 'Khadija Habli',        email: 'khadija.habli@newbox.tn',   password: 'Khadija@123', id: 'VL000002' },
  { name: 'Seif Gharbi',          email: 'seif.gharbi@newbox.tn',     password: 'Seif@123',    id: 'VL000004' },
  { name: 'Chaima Rekik',         email: 'chaima.rekik@newbox.tn',    password: 'Chaima@123',  id: 'VL000005' },
  { name: 'Fadhel Awedni',        email: 'fadhel.awedni@newbox.tn',   password: 'Fadhel@123',  id: 'VL000006' },
  { name: 'Zied Hachani',         email: 'zied.hachani@newbox.tn',    password: 'Zied@123',    id: 'VL000007' },
  { name: 'Rami Bouchaala',       email: 'rami.bouchaala@newbox.tn',  password: 'Rami@123',    id: 'VL000009' },
  { name: 'Mayssa Sallemi',       email: 'mayssa.sallemi@newbox.tn',  password: 'Mayssa@123',  id: 'VL000010' },
  { name: 'Mustafa Zribi',        email: 'mustafa.zribi@newbox.tn',   password: 'Mustafa@123', id: 'VL000011' },
  { name: 'Rabeb Mhamdi',         email: 'rabeb.mhamdi@newbox.tn',    password: 'Rabeb@123',   id: 'VL000012' },
  { name: 'Mohamed Mathlouthi',   email: 'mohamed.mathlouthi@newbox.tn', password: 'Mohamed@123', id: 'VL000013' },
  { name: 'Mohamed Ali Abid',     email: 'mohamed.abid@newbox.tn',    password: 'Mohamed@123', id: 'VL000014' },
  { name: 'Sirine Ben Zina',      email: 'sirine.benzina@newbox.tn',  password: 'Sirine@123',  id: 'VL000015' },
  { name: 'Abir Ben Mohamed',     email: 'abir.benmohamed@newbox.tn', password: 'Abir@123',    id: 'VL000016' },
  { name: 'Jabeur Mohamed',       email: 'jabeur.mohamed@newbox.tn',  password: 'Jabeur@123',  id: 'VL000017' },
  { name: 'Ramzi Megdiche',       email: 'ramzi.megdiche@newbox.tn',  password: 'Ramzi@123',   id: 'VL000019' },
  { name: 'Salma El Ouaer',       email: 'salma.ouaer@newbox.tn',     password: 'Salma@123',   id: 'VL000020' },
  { name: 'Mayar Abdaoui',        email: 'mayar.abdaoui@newbox.tn',   password: 'Mayar@123',   id: 'VL000021' },
  { name: 'Hedi Mchirgui',        email: 'hedi.mchirgui@newbox.tn',   password: 'Hedi@123',    id: 'VL000022' },
  { name: 'Rihab Belhammadi',     email: 'rihab.belhammadi@newbox.tn', password: 'Rihab@123',  id: 'VL000023' },
];

async function seed() {
  const client = await pool.connect();
  try {
    let created = 0;
    let skipped = 0;

    for (const c of COMMERCIALS) {
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [c.email]);
      if (existing.rows.length > 0) {
        console.log(`  SKIP ${c.id} ${c.name} — email already exists`);
        skipped++;
        continue;
      }

      const existingId = await client.query('SELECT id FROM users WHERE commercial_id = $1', [c.id]);
      if (existingId.rows.length > 0) {
        console.log(`  SKIP ${c.id} ${c.name} — commercial_id already exists`);
        skipped++;
        continue;
      }

      const hashed = await bcrypt.hash(c.password, 10);
      await client.query(
        `INSERT INTO users (name, email, password, role, commercial_id)
         VALUES ($1, $2, $3, 'commercial', $4)`,
        [c.name, c.email, hashed, c.id]
      );
      console.log(`  OK   ${c.id} ${c.name}`);
      created++;
    }

    console.log(`\nDone: ${created} created, ${skipped} skipped`);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

seed();
