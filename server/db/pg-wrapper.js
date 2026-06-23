const { getDb } = require('./schema');

// Wrapper to make pg work like better-sqlite3 for easier migration
// Usage: const db = require('./pg-wrapper');
//   db.get(sql, params) → single row
//   db.all(sql, params) → array of rows
//   db.run(sql, params) → { changes }
//   db.prepare(sql).get(...params) → single row
//   db.prepare(sql).all(...params) → array
//   db.prepare(sql).run(...params) → { changes }

function convertParams(sql, params) {
  let i = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++i}`);
  return pgSql;
}

// Fix SQLite-specific SQL for PostgreSQL
function fixSql(sql) {
  let s = sql;
  // datetime('now') → NOW()
  s = s.replace(/datetime\('now'\)/gi, 'NOW()');
  // date('now') → CURRENT_DATE
  s = s.replace(/date\('now'\)/gi, 'CURRENT_DATE');
  // date('now', '-X days') → CURRENT_DATE - INTERVAL 'X days'
  s = s.replace(/date\('now',\s*'(-?\d+)\s*days?'\)/gi, (_, n) => `(CURRENT_DATE + INTERVAL '${n} days')`);
  // date(column) → column::date
  s = s.replace(/\bdate\((\w+(?:\.\w+)?)\)/gi, '$1::date');
  // strftime('%H', col) → to_char(col, 'HH24')
  s = s.replace(/strftime\('%H',\s*(\w+(?:\.\w+)?)\)/gi, "to_char($1, 'HH24')");
  // COALESCE already works in both
  // ON CONFLICT(outlet_id, key) → ON CONFLICT ON CONSTRAINT settings_outlet_id_key_key
  // Actually PostgreSQL supports ON CONFLICT(col, col) so this is fine
  return s;
}

class PreparedStatement {
  constructor(sql) {
    this.sql = fixSql(convertParams(sql, []));
    this.originalSql = sql;
    this.paramCount = (sql.match(/\?/g) || []).length;
  }

  async get(...params) {
    const pool = getDb();
    const pgSql = fixSql(convertParams(this.originalSql, params));
    const { rows } = await pool.query(pgSql, params);
    return rows[0] || null;
  }

  async all(...params) {
    const pool = getDb();
    const pgSql = fixSql(convertParams(this.originalSql, params));
    const { rows } = await pool.query(pgSql, params);
    return rows;
  }

  async run(...params) {
    const pool = getDb();
    const pgSql = fixSql(convertParams(this.originalSql, params));
    const result = await pool.query(pgSql, params);
    return { changes: result.rowCount };
  }
}

const db = {
  prepare(sql) {
    return new PreparedStatement(sql);
  },

  async get(sql, params = []) {
    const pool = getDb();
    const pgSql = fixSql(convertParams(sql, params));
    const { rows } = await pool.query(pgSql, params);
    return rows[0] || null;
  },

  async all(sql, params = []) {
    const pool = getDb();
    const pgSql = fixSql(convertParams(sql, params));
    const { rows } = await pool.query(pgSql, params);
    return rows;
  },

  async run(sql, params = []) {
    const pool = getDb();
    const pgSql = fixSql(convertParams(sql, params));
    const result = await pool.query(pgSql, params);
    return { changes: result.rowCount };
  },

  transaction(fn) {
    return async () => {
      const pool = getDb();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    };
  }
};

module.exports = db;
