// Rx30 SQL Server integration.
//
// IMPORTANT: These queries use PLACEHOLDER table/column names.
// Once you have SQL Server credentials from Rx30 support, run:
//   SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'
// to get the actual schema, then update the queries below.
//
// Ask Rx30 support for:
//   - Patient table name and column names (first name, last name, phone, DOB)
//   - Prescription table name and the status code that means "Ready for pickup"
//   - Whether a credit/balance table exists and its structure

const sql = require('mssql');

let pool = null;
let activeConfig = null;

async function getPool(config) {
  // Reconnect if config changed
  const cfgKey = JSON.stringify(config);
  if (pool && activeConfig === cfgKey) return pool;
  if (pool) { try { await pool.close(); } catch (e) {} }

  pool = await sql.connect({
    server: config.server,
    port: parseInt(config.port) || 1433,
    database: config.database || 'RX30',
    user: config.user,
    password: config.password,
    options: {
      trustServerCertificate: true,
      encrypt: false,
    },
    connectionTimeout: 10000,
    requestTimeout: 15000,
  });
  activeConfig = cfgKey;
  return pool;
}

async function testConnection(config) {
  try {
    const p = await getPool(config);
    await p.request().query('SELECT 1 AS ok');
    return { ok: true };
  } catch (err) {
    pool = null;
    activeConfig = null;
    return { ok: false, error: err.message };
  }
}

// Returns patients with prescriptions ready for pickup today.
// PLACEHOLDER — update table/column names once schema is confirmed.
async function fetchPrescriptionsReady(config) {
  const p = await getPool(config);
  const result = await p.request().query(`
    SELECT
      p.PatientID,
      LTRIM(RTRIM(p.FirstName + ' ' + p.LastName)) AS nombre,
      p.Phone1     AS telefono,
      p.BirthDate  AS fecha_nacimiento
    FROM Patient p
    INNER JOIN Rx r ON r.PatientID = p.PatientID
    WHERE r.Status = 'R'
      AND r.FillDate >= CAST(GETDATE() AS DATE)
      AND p.Phone1 IS NOT NULL
      AND LEN(LTRIM(RTRIM(p.Phone1))) > 0
  `);
  return result.recordset.map(normalizeRow);
}

// Returns all active patients — for the Clientes tab.
// PLACEHOLDER — update as needed.
async function fetchAllPatients(config) {
  const p = await getPool(config);
  const result = await p.request().query(`
    SELECT
      p.PatientID,
      LTRIM(RTRIM(p.FirstName + ' ' + p.LastName)) AS nombre,
      p.Phone1     AS telefono,
      p.BirthDate  AS fecha_nacimiento
    FROM Patient p
    WHERE p.Active = 1
      AND p.Phone1 IS NOT NULL
      AND LEN(LTRIM(RTRIM(p.Phone1))) > 0
    ORDER BY p.LastName, p.FirstName
  `);
  return result.recordset.map(normalizeRow);
}

function normalizeRow(row) {
  return {
    nombre: row.nombre || '',
    telefono: (row.telefono || '').replace(/\D/g, '').slice(-10),
    fecha_nacimiento: row.fecha_nacimiento
      ? new Date(row.fecha_nacimiento).toISOString().split('T')[0]
      : null,
    saldo: row.saldo ? parseFloat(row.saldo).toFixed(2) : null,
    fecha_vencimiento: row.fecha_vencimiento
      ? new Date(row.fecha_vencimiento).toISOString().split('T')[0]
      : null,
    receta_lista: row.receta_lista != null ? String(row.receta_lista) : '0',
  };
}

module.exports = { testConnection, fetchPrescriptionsReady, fetchAllPatients };
