const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'routes', 'vppRoutes.js');
let code = fs.readFileSync(filePath, 'utf8');

// Update POST /item to include NguonMua
code = code.replace(
  `INSERT INTO dbo.VANPHONGPHAM (MaCap3, TenVPP, DonViTinh, GhiChu, SanPhamId, ThuongHieu, NhaCungCap)`,
  `INSERT INTO dbo.VANPHONGPHAM (MaCap3, TenVPP, DonViTinh, GhiChu, SanPhamId, ThuongHieu, NhaCungCap, NguonMua)`
);
code = code.replace(
  `VALUES (@MaCap3, @TenVPP, @DonViTinh, @GhiChu, @SanPhamId, @ThuongHieu, @NhaCungCap)`,
  `VALUES (@MaCap3, @TenVPP, @DonViTinh, @GhiChu, @SanPhamId, @ThuongHieu, @NhaCungCap, @NguonMua)`
);
code = code.replace(
  `.input('NhaCungCap', sql.NVarChar, req.body.NhaCungCap || '')`,
  `.input('NhaCungCap', sql.NVarChar, req.body.NhaCungCap || '')\n        .input('NguonMua', sql.NVarChar, req.body.NguonMua || 'VN')`
);

// Update GET /items to select NguonMua
code = code.replace(
  `v.Id, v.MaCap3, v.TenVPP, v.DonViTinh, v.GhiChu, v.HinhAnh, v.SanPhamId, v.ThuongHieu, v.NhaCungCap,`,
  `v.Id, v.MaCap3, v.TenVPP, v.DonViTinh, v.GhiChu, v.HinhAnh, v.SanPhamId, v.ThuongHieu, v.NhaCungCap, v.NguonMua,`
);

// Rewrite POST /import
const generateMaDonNhap = `
        const vppIds = items.map(i => i.VppId).filter(id => id != null && id !== '');
        let nguonMuaPrefix = 'FVN';
        let nguonMua = 'VN';
        if (vppIds.length > 0) {
          const idList = vppIds.join(',');
          const sourceCheck = await pool.request().query(\`SELECT DISTINCT NguonMua FROM dbo.V_VATTU WHERE Id IN (\${idList})\`);
          if (sourceCheck.recordset.length > 1) {
             return res.status(400).send("Không thể tạo chung phiếu cho vật tư VN và CN. Vui lòng tách 2 phiếu riêng.");
          }
          if (sourceCheck.recordset.length === 1) {
             nguonMua = sourceCheck.recordset[0].NguonMua || 'VN';
             nguonMuaPrefix = (nguonMua === 'CN') ? 'FCN' : 'FVN';
          }
        }
        
        const today = new Date();
        const dateStr = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
        const todayYMD = today.toISOString().slice(0, 10);
        const countResult = await pool.request().input('Today', sql.Date, todayYMD).query(\`SELECT COUNT(DISTINCT MaDon) AS Cnt FROM dbo.NHAP_VPP WHERE CAST(NgayNhap AS DATE) = @Today\`);
        const nextNum = String(countResult.recordset[0].Cnt + 1).padStart(3, '0');
        const maDon = nguonMuaPrefix + nextNum + 'A-' + dateStr;
        
        const request = new sql.Request(transaction);
`;
code = code.replace(
  /const request = new sql\.Request\(transaction\);[\s\S]*?const maDon = 'PN-' \+ date\.getFullYear\(\) \+ String\(date\.getMonth\(\) \+ 1\)\.padStart\(2, '0'\) \+ String\(date\.getDate\(\)\)\.padStart\(2, '0'\) \+ '-' \+ Math\.floor\(Math\.random\(\) \* 10000\)\.toString\(\)\.padStart\(4, '0'\);/,
  generateMaDonNhap
);

// In POST /import, for new items, insert NguonMua
code = code.replace(
  `INSERT INTO dbo.VANPHONGPHAM (TenVPP, DonViTinh)`,
  `INSERT INTO dbo.VANPHONGPHAM (TenVPP, DonViTinh, NguonMua)`
);
code = code.replace(
  `VALUES (@TenVPP, @DonViTinh)`,
  `VALUES (@TenVPP, @DonViTinh, '${'VN'}')` // Temporary fix, should use nguonMua var but string literal is easier here since we don't parameterize it below. Wait, let's just parameterize it!
);
code = code.replace(
  `.input('DonViTinh', sql.NVarChar, item.DonViTinh || '')`,
  `.input('DonViTinh', sql.NVarChar, item.DonViTinh || '')\n              .input('NguonMua', sql.NVarChar, nguonMua)`
);
code = code.replace(
  `VALUES (@TenVPP, @DonViTinh, 'VN')`,
  `VALUES (@TenVPP, @DonViTinh, @NguonMua)`
);

// Rewrite POST /export
const generateMaDonXuat = `
        const vppIds = items.map(i => i.VppId).filter(id => id != null && id !== '');
        let nguonMuaPrefix = 'FVN';
        let nguonMua = 'VN';
        if (vppIds.length > 0) {
          const idList = vppIds.join(',');
          const sourceCheck = await pool.request().query(\`SELECT DISTINCT NguonMua FROM dbo.V_VATTU WHERE Id IN (\${idList})\`);
          if (sourceCheck.recordset.length > 1) {
             return res.status(400).send("Không thể xuất chung phiếu cho vật tư VN và CN. Vui lòng tách 2 phiếu riêng.");
          }
          if (sourceCheck.recordset.length === 1) {
             nguonMua = sourceCheck.recordset[0].NguonMua || 'VN';
             nguonMuaPrefix = (nguonMua === 'CN') ? 'FCN' : 'FVN';
          }
        }
        
        const today = new Date();
        const dateStr = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
        const todayYMD = today.toISOString().slice(0, 10);
        const countResult = await pool.request().input('Today', sql.Date, todayYMD).query(\`SELECT COUNT(DISTINCT MaDon) AS Cnt FROM dbo.XUAT_VPP WHERE CAST(NgayXuat AS DATE) = @Today\`);
        const nextNum = String(countResult.recordset[0].Cnt + 1).padStart(3, '0');
        const maDon = nguonMuaPrefix + nextNum + 'B-' + dateStr;
`;
code = code.replace(
  /const date = new Date\(\);[\s\S]*?const maDon = 'PX-' \+ date\.getFullYear\(\) \+ String\(date\.getMonth\(\) \+ 1\)\.padStart\(2, '0'\) \+ String\(date\.getDate\(\)\)\.padStart\(2, '0'\) \+ '-' \+ Math\.floor\(Math\.random\(\) \* 10000\)\.toString\(\)\.padStart\(4, '0'\);/,
  generateMaDonXuat
);

// GET /import-list and GET /export-list ORDER BY ASC
code = code.replace(`ORDER BY n.NgayNhap DESC`, `ORDER BY n.NgayNhap ASC`);
code = code.replace(`ORDER BY x.NgayXuat DESC`, `ORDER BY x.NgayXuat ASC`);

fs.writeFileSync(filePath, code);
console.log("Updated vppRoutes.js logic successfully!");
