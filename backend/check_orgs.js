require('dotenv').config();
const mysql = require('mysql2');
const conn = mysql.createConnection({host:'localhost',port:3306,user:'root',password:'',database:'task_manager'});
conn.connect(err => {
  if(err){ console.log('ERR:'+err.message); process.exit(1); }
  conn.query("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_code VARCHAR(20) UNIQUE", err => {
    conn.query("UPDATE organizations SET company_code = CONCAT('ORG-', UPPER(SUBSTRING(slug,1,4)), '-', id) WHERE company_code IS NULL", err2 => {
      conn.query('SELECT id, name, company_code FROM organizations', (err3, r) => {
        console.log(JSON.stringify(r, null, 2));
        conn.end(); process.exit(0);
      });
    });
  });
});
