const sql = require('mssql');
const fs = require('fs');

const config = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'Abc@123456!',
  server: process.env.DB_SERVER || '192.168.11.205',
  database: 'QuanLyVanPhongPham',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  }
};

/**
 * Manually parse CSV to handle multiline quoted fields, commas inside quotes, etc.
 */
function parseCSV(content) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        if (char === '\r') i++; // Skip \n in \r\n
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }
  
  if (currentRow.length > 0 || currentField) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  
  return rows;
}

async function runMigrationAndSeed() {
  let pool;
  try {
    console.log('1. Connecting to SQL Server...');
    pool = await sql.connect(config);
    console.log('Connected successfully.\n');

    // =========================================================================
    // STEP 1: Create 2 new tables (LOAI_VATTU and SANPHAM)
    // =========================================================================
    console.log('2. Creating tables LOAI_VATTU and SANPHAM if not exist...');
    await pool.request().query(`
      -- Cấp 1: Loại vật tư
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LOAI_VATTU' and xtype='U')
      CREATE TABLE LOAI_VATTU (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        MaCap1 NVARCHAR(20) NOT NULL,
        TenCap1 NVARCHAR(255) NOT NULL,
        CONSTRAINT UQ_LOAI_VATTU_MaCap1 UNIQUE (MaCap1)
      );

      -- Cấp 2: Sản phẩm
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SANPHAM' and xtype='U')
      CREATE TABLE SANPHAM (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        MaCap2 NVARCHAR(20) NOT NULL,
        TenCap2 NVARCHAR(255) NOT NULL,
        LoaiVatTuId INT NOT NULL,
        CONSTRAINT UQ_SANPHAM_MaCap2 UNIQUE (MaCap2),
        CONSTRAINT FK_SANPHAM_LOAI FOREIGN KEY (LoaiVatTuId) REFERENCES LOAI_VATTU(Id)
      );
    `);
    console.log('Tables created or already exist.\n');

    // =========================================================================
    // STEP 2: Modify table VANPHONGPHAM
    // =========================================================================
    console.log('3. Modifying VANPHONGPHAM table...');
    
    // Create SanPhamId if not exists
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'SanPhamId' AND Object_ID = Object_ID(N'VANPHONGPHAM'))
      BEGIN
          ALTER TABLE VANPHONGPHAM ADD SanPhamId INT NULL;
      END
    `);

    // Create MaCap3 if not exists
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'MaCap3' AND Object_ID = Object_ID(N'VANPHONGPHAM'))
      BEGIN
          ALTER TABLE VANPHONGPHAM ADD MaCap3 NVARCHAR(20) NULL;
      END
    `);

    // Copy data from MaVPP to MaCap3 and drop MaVPP
    const hasMaVPP = await pool.request().query(`
      SELECT 1 FROM sys.columns WHERE Name = N'MaVPP' AND Object_ID = Object_ID(N'VANPHONGPHAM')
    `);
    
    if (hasMaVPP.recordset.length > 0) {
      console.log('   Found MaVPP column. Migrating data to MaCap3 and dropping MaVPP...');
      await pool.request().query(`
        -- Update MaCap3 from MaVPP
        UPDATE VANPHONGPHAM SET MaCap3 = MaVPP WHERE MaCap3 IS NULL AND MaVPP IS NOT NULL;
        
        -- Drop any constraints depending on MaVPP before dropping the column
        DECLARE @SQL NVARCHAR(MAX) = N'';
        SELECT @SQL += N'ALTER TABLE VANPHONGPHAM DROP CONSTRAINT ' + QUOTENAME(c.name) + ';'
        FROM sys.key_constraints c
        JOIN sys.index_columns ic ON c.parent_object_id = ic.object_id AND c.unique_index_id = ic.index_id
        JOIN sys.columns col ON ic.object_id = col.object_id AND ic.column_id = col.column_id
        WHERE c.parent_object_id = OBJECT_ID('VANPHONGPHAM') AND col.name = 'MaVPP';
        EXEC sp_executesql @SQL;

        SELECT @SQL = N'';
        SELECT @SQL += N'ALTER TABLE VANPHONGPHAM DROP CONSTRAINT ' + QUOTENAME(dc.name) + ';'
        FROM sys.default_constraints dc
        JOIN sys.columns col ON dc.parent_object_id = col.object_id AND dc.parent_column_id = col.column_id
        WHERE dc.parent_object_id = OBJECT_ID('VANPHONGPHAM') AND col.name = 'MaVPP';
        EXEC sp_executesql @SQL;

        ALTER TABLE VANPHONGPHAM DROP COLUMN MaVPP;
      `);
    }

    // Ensure MaCap3 has unique constraint
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.key_constraints WHERE type = 'UQ' AND parent_object_id = OBJECT_ID('VANPHONGPHAM') AND name = 'UQ_VANPHONGPHAM_MaCap3')
      BEGIN
          BEGIN TRY
              ALTER TABLE VANPHONGPHAM ADD CONSTRAINT UQ_VANPHONGPHAM_MaCap3 UNIQUE (MaCap3);
          END TRY
          BEGIN CATCH
              PRINT 'Warning: Could not add unique constraint UQ_VANPHONGPHAM_MaCap3. Possibly due to duplicates or nulls.';
          END CATCH
      END
    `);

    // Ensure FK to SANPHAM exists
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE object_id = OBJECT_ID(N'FK_VANPHONGPHAM_SANPHAM') AND parent_object_id = OBJECT_ID(N'VANPHONGPHAM'))
      BEGIN
          BEGIN TRY
              ALTER TABLE VANPHONGPHAM ADD CONSTRAINT FK_VANPHONGPHAM_SANPHAM FOREIGN KEY (SanPhamId) REFERENCES SANPHAM(Id);
          END TRY
          BEGIN CATCH
              PRINT 'Warning: Could not add FK FK_VANPHONGPHAM_SANPHAM.';
          END CATCH
      END
    `);
    console.log('VANPHONGPHAM modification complete.\n');

    // =========================================================================
    // STEP 3: Read CSV and filter data
    // =========================================================================
    console.log('4. Reading CSV file...');
    const csvPath = 'c:\\Laptrinhweb\\webcty2\\Danh muc vat tu\\Danh_muc_vat_tu.csv';
    
    if (!fs.existsSync(csvPath)) {
        throw new Error(`CSV file not found at: ${csvPath}`);
    }

    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const allRows = parseCSV(csvContent);
    
    // Filter and transform rows
    // Columns: A=Mã 1(0), B=Tên 1(1), C=Tên 2(2), D=Mã 2(3), E=Tên 3(4), F=Mã 3(5)
    const validRows = [];
    // Skip row 0 (headers)
    for (let i = 1; i < allRows.length; i++) {
        const row = allRows[i];
        if (row.length < 6) continue;

        const maCap1Raw = (row[0] || '').trim();
        const tenCap3Raw = (row[4] || '').trim();
        
        if (!maCap1Raw) continue;

        // SKIP rules
        const skipPrefixes = ['F08', 'F10', 'F11', 'F12', 'F13', 'F14'];
        if (skipPrefixes.some(p => maCap1Raw.startsWith(p))) continue;
        if (!tenCap3Raw) continue; // Skip empty TenCap3

        // KEEP F09 variants
        if (maCap1Raw.startsWith('F09')) {
            validRows.push({
                maCap1: 'F09',
                tenCap1: 'văn phòng phẩm 办公文具',
                tenCap2: (row[2] || '').trim(),
                maCap2: (row[3] || '').trim(),
                tenCap3: tenCap3Raw,
                maCap3: (row[5] || '').trim()
            });
        }
    }
    
    console.log(`Found ${validRows.length} valid rows to process after filtering.\n`);

    // =========================================================================
    // STEP 4: Seed data
    // =========================================================================
    console.log('5. Seeding data...');

    // 1. Insert Cấp 1
    console.log('   Seeding LOAI_VATTU (Cấp 1)...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM LOAI_VATTU WHERE MaCap1 = 'F09')
      BEGIN
          INSERT INTO LOAI_VATTU (MaCap1, TenCap1) VALUES ('F09', N'văn phòng phẩm 办公文具');
      END
    `);
    
    // Get LoaiVatTuId
    const loaiVatTuRes = await pool.request().query("SELECT Id FROM LOAI_VATTU WHERE MaCap1 = 'F09'");
    const loaiVatTuId = loaiVatTuRes.recordset[0].Id;

    // 2. Insert Cấp 2
    console.log('   Seeding SANPHAM (Cấp 2)...');
    const cap2Map = new Map(); // Keep track to deduplicate locally first
    for (const row of validRows) {
        if (!cap2Map.has(row.maCap2)) {
            cap2Map.set(row.maCap2, row.tenCap2);
        }
    }
    
    let sanPhamCount = 0;
    for (const [maCap2, tenCap2] of cap2Map.entries()) {
        if (!maCap2) continue;
        await pool.request()
            .input('MaCap2', sql.NVarChar, maCap2)
            .input('TenCap2', sql.NVarChar, tenCap2)
            .input('LoaiVatTuId', sql.Int, loaiVatTuId)
            .query(`
                IF NOT EXISTS (SELECT 1 FROM SANPHAM WHERE MaCap2 = @MaCap2)
                BEGIN
                    INSERT INTO SANPHAM (MaCap2, TenCap2, LoaiVatTuId)
                    VALUES (@MaCap2, @TenCap2, @LoaiVatTuId);
                END
            `);
        sanPhamCount++;
    }

    // Cache SANPHAM IDs
    const sanPhamRes = await pool.request().query("SELECT Id, MaCap2 FROM SANPHAM WHERE LoaiVatTuId = " + loaiVatTuId);
    const sanPhamIdMap = new Map();
    sanPhamRes.recordset.forEach(record => sanPhamIdMap.set(record.MaCap2, record.Id));

    // 3. Insert Cấp 3 (VANPHONGPHAM)
    console.log('   Seeding VANPHONGPHAM (Cấp 3)...');
    let vppCount = 0;
    for (const row of validRows) {
        const maCap3 = row.maCap3;
        const tenCap3 = row.tenCap3;
        const spId = sanPhamIdMap.get(row.maCap2);

        if (!maCap3 || !spId) continue;

        await pool.request()
            .input('MaCap3', sql.NVarChar, maCap3)
            .input('TenVPP', sql.NVarChar, tenCap3)
            .input('SanPhamId', sql.Int, spId)
            .query(`
                IF NOT EXISTS (SELECT 1 FROM VANPHONGPHAM WHERE MaCap3 = @MaCap3)
                BEGIN
                    INSERT INTO VANPHONGPHAM (MaCap3, TenVPP, SanPhamId, SoLuongTon, DonViTinh)
                    VALUES (@MaCap3, @TenVPP, @SanPhamId, 0, '');
                END
            `);
        vppCount++;
    }

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n=========================================');
    console.log('MIGRATION & SEEDING COMPLETE');
    console.log('=========================================');
    console.log(`Unique Cấp 2 (SANPHAM) processed: ${sanPhamCount}`);
    console.log(`Cấp 3 (VANPHONGPHAM) items processed: ${vppCount}`);

  } catch (err) {
    console.error('Error during migration and seeding:', err);
  } finally {
    if (pool) {
      await pool.close();
      console.log('Database connection closed.');
    }
  }
}

runMigrationAndSeed();
