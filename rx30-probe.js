// Quick Rx30 SQL Server probe — run while on pharmacy VPN.
// Usage: node rx30-probe.js <server> <user> <password> [database]
// Example: node rx30-probe.js 192.168.1.50 rx30user mypass RX30

const sql = require('mssql');

const [,, server, user, password, database = 'RX30'] = process.argv;

if (!server || !user || !password) {
  console.error('Usage: node rx30-probe.js <server> <user> <password> [database]');
  process.exit(1);
}

const config = {
  server,
  port: 1433,
  database,
  user,
  password,
  options: { trustServerCertificate: true, encrypt: false },
  connectionTimeout: 10000,
  requestTimeout: 15000,
};

async function main() {
  console.log(`\nConnecting to ${server}/${database} as ${user}...`);
  let pool;
  try {
    pool = await sql.connect(config);
    console.log('✅ Connected!\n');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }

  // List all tables
  const tables = await pool.request().query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME`
  );
  console.log(`Tables in ${database} (${tables.recordset.length} total):`);
  tables.recordset.forEach(r => console.log('  ', r.TABLE_NAME));

  // Try common Rx30 patient tables
  const candidates = ['Patient', 'Patients', 'PAT', 'PATIENT'];
  for (const tbl of candidates) {
    try {
      const r = await pool.request().query(`SELECT TOP 1 * FROM ${tbl}`);
      console.log(`\n✅ Found patient table: ${tbl}`);
      console.log('   Columns:', Object.keys(r.recordset[0] || {}).join(', '));
      const cnt = await pool.request().query(`SELECT COUNT(*) AS n FROM ${tbl}`);
      console.log('   Row count:', cnt.recordset[0].n);
      break;
    } catch (e) {
      // table doesn't exist, try next
    }
  }

  // Try common Rx30 prescription tables
  const rxCandidates = ['Rx', 'RX', 'Prescription', 'Prescriptions'];
  for (const tbl of rxCandidates) {
    try {
      const r = await pool.request().query(`SELECT TOP 1 * FROM ${tbl}`);
      console.log(`\n✅ Found prescription table: ${tbl}`);
      console.log('   Columns:', Object.keys(r.recordset[0] || {}).join(', '));
      break;
    } catch (e) {
      // table doesn't exist, try next
    }
  }

  await pool.close();
  console.log('\nDone.\n');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
