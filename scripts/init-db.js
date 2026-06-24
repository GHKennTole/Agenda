const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Leer .env.local de forma manual para evitar dependencias adicionales
const envPath = path.join(__dirname, '..', '.env.local');
let databaseUrl = '';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    if (line.startsWith('DATABASE_URL=')) {
      databaseUrl = line.substring('DATABASE_URL='.length).trim();
      break;
    }
  }
}

if (!databaseUrl) {
  console.error("Error: No se encontró DATABASE_URL en .env.local");
  process.exit(1);
}

console.log("Conectando a la base de datos de Supabase...");
const client = new Client({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false // Requerido para conexiones a Supabase desde entornos externos sin certificado local
  }
});

async function main() {
  try {
    await client.connect();
    console.log("Conexión exitosa.");
    
    const sqlPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log("Ejecutando script de migración SQL en Supabase...");
    await client.query(sql);
    console.log("¡Tablas, políticas de RLS y triggers creados exitosamente en tu base de datos!");
  } catch (err) {
    console.error("Error al inicializar la base de datos:", err);
  } finally {
    await client.end();
  }
}

main();
