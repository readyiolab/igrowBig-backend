const mysql = require("mysql2");
const { dbHost, dbName, dbPass, dbUser } = require("../config/dotenvConfig");

class Database {
  constructor() {
    const isProduction = process.env.NODE_ENV === "production";

    this.host = dbHost || (!isProduction ? "localhost" : null);
    this.username = dbUser || (!isProduction ? "root" : null);
    this.password = dbPass != null && dbPass !== "" ? dbPass : (!isProduction ? "" : null);
    this.database = dbName || (!isProduction ? "db_igrowbig" : null);

    if (!this.host || !this.username || !this.database) {
      console.error(
        "FATAL: Database credentials must be set via DB_HOST, DB_USER, DB_PASS, DB_NAME environment variables."
      );
      process.exit(1);
    }

    this.pool = mysql.createPool({
      host: this.host,
      user: this.username,
      password: this.password,
      database: this.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });

    this.pool.getConnection((err, connection) => {
      if (err) {
        console.error("Database Connectivity Error:", err);
        return;
      }
      console.log("Connected to database pool successfully!");
      connection.release();
    });
  }

  select(tbl_name, column = "*", where = "", params = [], print = false) {
    let wr = "";
    if (where !== "") {
      wr = `WHERE ${where}`;
    }
    const sql = `SELECT ${column} FROM ${tbl_name} ${wr}`;
    if (print) {
      console.log(sql, params);
    }
    return new Promise((resolve, reject) => {
      this.pool.query(sql, params, (err, results) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(results[0]);
      });
    });
  }

  selectAll(
    tbl_name,
    column = "*",
    where = "",
    params = [],
    orderby = "",
    print = false
  ) {
    let wr = "";
    if (where !== "") {
      wr = `WHERE ${where}`;
    }
    const sql = `SELECT ${column} FROM ${tbl_name} ${wr} ${orderby}`;
    if (print) {
      console.log(sql, params);
    }
    return new Promise((resolve, reject) => {
      this.pool.query(sql, params, (err, results) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(results);
      });
    });
  }

  insert(tbl_name, data, print = false) {
    const sql = `INSERT INTO ${tbl_name} SET ?`;
    if (print) {
      console.log(sql, data);
    }
    return new Promise((resolve, reject) => {
      this.pool.query(sql, data, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          status: true,
          insert_id: result.insertId,
          affected_rows: result.affectedRows,
          info: result.info,
        });
      });
    });
  }

  update(table_name, form_data, where = "", params = [], print = false) {
    let whereSQL = "";
    if (where !== "") {
      whereSQL = ` WHERE ${where}`;
    }
    const sql = `UPDATE ${table_name} SET ? ${whereSQL}`;
    if (print) {
      console.log(sql, [form_data, ...params]);
    }
    return new Promise((resolve, reject) => {
      this.pool.query(sql, [form_data, ...params], (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          status: true,
          affected_rows: result.affectedRows,
          info: result.info,
        });
      });
    });
  }

  delete(tbl_name, where = "", params = [], print = false) {
    let whereSQL = "";
    if (where !== "") {
      whereSQL = ` WHERE ${where}`;
    }
    const sql = `DELETE FROM ${tbl_name} ${whereSQL}`;
    if (print) {
      console.log(sql, params);
    }
    return new Promise((resolve, reject) => {
      this.pool.query(sql, params, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          status: true,
          info: result.info,
        });
      });
    });
  }

  query(sql, params = [], print = false) {
    if (print) {
      console.log(sql, params);
    }
    return new Promise((resolve, reject) => {
      this.pool.query(sql, params, (err, results) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(results[0]);
      });
    });
  }

  queryAll(sql, params = [], print = false) {
    if (print) {
      console.log(sql, params);
    }
    return new Promise((resolve, reject) => {
      this.pool.query(sql, params, (err, results) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(results);
      });
    });
  }

  insertAll(sql, params = [], print = false) {
    if (print) {
      console.log(sql, params);
    }
    return new Promise((resolve, reject) => {
      this.pool.query(sql, params, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          status: true,
          insert_id: result.insertId,
          affected_rows: result.affectedRows,
          info: result.info,
        });
      });
    });
  }
}

const db = new Database();

module.exports = db;
