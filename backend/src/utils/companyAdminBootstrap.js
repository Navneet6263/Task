const { ensureUniqueEmployeeId } = require('./employeeId');

const slugify = (value) => {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

const codePrefix = (name) => {
  const clean = String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return (clean.slice(0, 4) || 'COMP').padEnd(4, 'X');
};

const generateCompanyCode = async (db, companyName) => {
  const prefix = codePrefix(companyName);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
    const code = `ORG-${prefix}-${suffix}`;
    const [rows] = await db.execute('SELECT id FROM organizations WHERE company_code = ? LIMIT 1', [code]);
    if (rows.length === 0) return code;
  }

  return `ORG-${prefix}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
};

const createOrganizationForCompanyAdmin = async (db, companyAdmin) => {
  const baseName = companyAdmin.name ? `${companyAdmin.name} Workspace` : `Company ${companyAdmin.id} Workspace`;
  const slug = `${slugify(baseName)}-${Date.now()}`;
  const companyCode = await generateCompanyCode(db, baseName);

  const [result] = await db.execute(
    `INSERT INTO organizations (name, slug, company_code, company_admin_id)
     VALUES (?, ?, ?, ?)`,
    [baseName, slug, companyCode, companyAdmin.id]
  );

  return result.insertId;
};

const ensureCompanyAdminBootstrap = async (db, companyAdminId) => {
  const [[companyAdmin]] = await db.execute(
    'SELECT id, name, email, password, mobile FROM company_admins WHERE id = ?',
    [companyAdminId]
  );

  if (!companyAdmin) {
    throw new Error('Company admin not found');
  }

  let [orgs] = await db.execute(
    'SELECT id FROM organizations WHERE company_admin_id = ? ORDER BY id ASC',
    [companyAdminId]
  );

  if (orgs.length === 0) {
    const orgId = await createOrganizationForCompanyAdmin(db, companyAdmin);
    orgs = [{ id: orgId }];
  }

  const primaryOrgId = orgs[0].id;
  const [users] = await db.execute(
    'SELECT id, is_deleted, employee_id FROM users WHERE LOWER(email) = LOWER(?) ORDER BY id ASC',
    [companyAdmin.email]
  );

  let linkedUserId = null;
  const generatedEmployeeId = await ensureUniqueEmployeeId(db, users[0]?.employee_id || null, 'CA', companyAdmin.id);

  if (users.length > 0) {
    linkedUserId = users[0].id;
    await db.execute(
      `UPDATE users
       SET role = 'admin',
           password = ?,
           is_deleted = FALSE,
           deleted_at = NULL,
           org_id = COALESCE(org_id, ?),
           name = COALESCE(NULLIF(name, ''), ?),
           mobile = COALESCE(mobile, ?),
           employee_id = COALESCE(employee_id, ?)
       WHERE id = ?`,
      [companyAdmin.password, primaryOrgId, companyAdmin.name, companyAdmin.mobile || null, generatedEmployeeId, linkedUserId]
    );
  } else {
    const [insertUser] = await db.execute(
      `INSERT INTO users (name, email, password, mobile, employee_id, role, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [companyAdmin.name, companyAdmin.email, companyAdmin.password, companyAdmin.mobile || null, generatedEmployeeId, 'admin', primaryOrgId]
    );
    linkedUserId = insertUser.insertId;
  }

  return {
    linkedUserId,
    primaryOrgId,
    orgIds: orgs.map((org) => org.id),
  };
};

module.exports = {
  ensureCompanyAdminBootstrap,
  generateCompanyCode,
};
