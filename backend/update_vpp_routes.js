const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'routes', 'vppRoutes.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Cập nhật POST /import
const generateMaDonNhap = `
      const date = new Date();
      const maDon = 'PN-' + date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0') + '-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
`;
code = code.replace(
  `const request = new sql.Request(transaction);`,
  `const request = new sql.Request(transaction);\n${generateMaDonNhap}`
);
code = code.replace(
  `INSERT INTO dbo.NHAP_VPP (VppId, SoLuong, DonGia, VAT, ThanhTien, NguoiNhap, GhiChu)`,
  `INSERT INTO dbo.NHAP_VPP (VppId, SoLuong, DonGia, VAT, ThanhTien, NguoiNhap, GhiChu, MaDon, PheDuyet)`
);
code = code.replace(
  `VALUES (@VppId2, @SoLuong, @DonGia, @VAT, @ThanhTien, @NguoiNhap, @GhiChuNhap)`,
  `VALUES (@VppId2, @SoLuong, @DonGia, @VAT, @ThanhTien, @NguoiNhap, @GhiChuNhap, @MaDon, 0)`
);
code = code.replace(
  `.input('GhiChuNhap', sql.NVarChar, item.GhiChu || '')`,
  `.input('GhiChuNhap', sql.NVarChar, item.GhiChu || '')\n            .input('MaDon', sql.NVarChar, maDon)`
);


// 2. Cập nhật POST /export
const generateMaDonXuat = `
      const date = new Date();
      const maDon = 'PX-' + date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0') + '-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
`;
code = code.replace(
  `for (let item of items) {`,
  `${generateMaDonXuat}\n        for (let item of items) {`
);
code = code.replace(
  `INSERT INTO dbo.XUAT_VPP (VppId, Loai, SoLuong, NguoiNhan, GhiChu, MSNV, BoPhan)`,
  `INSERT INTO dbo.XUAT_VPP (VppId, Loai, SoLuong, NguoiNhan, GhiChu, MSNV, BoPhan, MaDon, PheDuyet)`
);
code = code.replace(
  `VALUES (@VppId, @Loai, @SoLuong, @NguoiNhan, @GhiChu, @MSNV, @BoPhan)`,
  `VALUES (@VppId, @Loai, @SoLuong, @NguoiNhan, @GhiChu, @MSNV, @BoPhan, @MaDon, 0)`
);
code = code.replace(
  `.input('BoPhan', sql.NVarChar, item.BoPhan || '')`,
  `.input('BoPhan', sql.NVarChar, item.BoPhan || '')\n            .input('MaDon', sql.NVarChar, maDon)`
);

// 3. Thêm các API mới (GET, PUT, DELETE) trước đoạn IMPORT EXCEL
const newRoutes = `

  // =============================================
  // QUẢN LÝ ĐƠN NHẬP KHO
  // =============================================
  router.get('/import-list', authenticate, async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(\`
        SELECT n.Id, n.MaDon, v.MaCap3, v.TenVPP, n.SoLuong, n.DonGia, n.VAT, n.ThanhTien, n.NguoiNhap, n.PheDuyet, n.NgayNhap
        FROM dbo.NHAP_VPP n
        JOIN dbo.V_VATTU v ON n.VppId = v.Id AND n.Loai = v.Loai
        ORDER BY n.NgayNhap DESC
      \`);
      res.json(result.recordset);
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi lấy danh sách đơn nhập");
    }
  });

  router.put('/import/approve', authenticate, async (req, res) => {
    const { ids, status } = req.body;
    if (!ids || !ids.length) return res.status(400).send("Không có ID");
    try {
      const pool = await poolPromise;
      const idList = ids.join(',');
      await pool.request().query(\`UPDATE dbo.NHAP_VPP SET PheDuyet = \${status} WHERE Id IN (\${idList})\`);
      res.json({ message: "Cập nhật thành công" });
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi cập nhật");
    }
  });

  router.delete('/import/:id', authenticate, async (req, res) => {
    const id = req.params.id;
    try {
      const pool = await poolPromise;
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const reqCheck = new sql.Request(transaction);
        const nhapData = await reqCheck.input('Id', sql.Int, id).query(\`SELECT VppId, Loai, SoLuong, DonGia, VAT, ThanhTien FROM dbo.NHAP_VPP WHERE Id = @Id AND PheDuyet = 0\`);
        if (nhapData.recordset.length === 0) throw new Error("Không tìm thấy hoặc đã được phê duyệt (khóa)");
        
        const data = nhapData.recordset[0];
        
        // Trừ tồn kho
        const reqUpdate = new sql.Request(transaction);
        await reqUpdate
          .input('VppId', sql.Int, data.VppId)
          .input('Loai', sql.VarChar, data.Loai)
          .input('Qty', sql.Float, data.SoLuong)
          .input('ThanhTien', sql.Float, data.ThanhTien)
          .query(\`
            UPDATE dbo.TONKHO_VPP 
            SET SoLuongTon = SoLuongTon - @Qty,
                DonGiaTon = CASE WHEN (SoLuongTon - @Qty) > 0 THEN ((SoLuongTon * DonGiaTon) - @ThanhTien) / (SoLuongTon - @Qty) ELSE 0 END
            WHERE VppId = @VppId AND Loai = @Loai
          \`);
          
        const reqDel = new sql.Request(transaction);
        await reqDel.input('Id', sql.Int, id).query(\`DELETE FROM dbo.NHAP_VPP WHERE Id = @Id\`);
        
        await transaction.commit();
        res.json({ message: "Xóa thành công" });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).send(err.message || "Lỗi xóa đơn nhập");
    }
  });
  
  router.put('/import/:id', authenticate, async (req, res) => {
    const id = req.params.id;
    const { SoLuong, DonGia, VAT } = req.body;
    try {
      const pool = await poolPromise;
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const reqCheck = new sql.Request(transaction);
        const nhapData = await reqCheck.input('Id', sql.Int, id).query(\`SELECT VppId, Loai, SoLuong, DonGia, VAT, ThanhTien FROM dbo.NHAP_VPP WHERE Id = @Id AND PheDuyet = 0\`);
        if (nhapData.recordset.length === 0) throw new Error("Không tìm thấy hoặc đã được phê duyệt (khóa)");
        
        const oldData = nhapData.recordset[0];
        const newThanhTien = SoLuong * (DonGia * (1 + (VAT || 0)/100.0));
        
        // Trừ cái cũ, cộng cái mới vào tồn kho
        const reqUpdate = new sql.Request(transaction);
        await reqUpdate
          .input('VppId', sql.Int, oldData.VppId)
          .input('Loai', sql.VarChar, oldData.Loai)
          .input('OldQty', sql.Float, oldData.SoLuong)
          .input('OldThanhTien', sql.Float, oldData.ThanhTien)
          .input('NewQty', sql.Float, SoLuong)
          .input('NewThanhTien', sql.Float, newThanhTien)
          .query(\`
            UPDATE dbo.TONKHO_VPP 
            SET SoLuongTon = SoLuongTon - @OldQty + @NewQty,
                DonGiaTon = CASE WHEN (SoLuongTon - @OldQty + @NewQty) > 0 
                            THEN ((SoLuongTon * DonGiaTon) - @OldThanhTien + @NewThanhTien) / (SoLuongTon - @OldQty + @NewQty) 
                            ELSE 0 END
            WHERE VppId = @VppId AND Loai = @Loai
          \`);
          
        const reqSave = new sql.Request(transaction);
        await reqSave
          .input('Id', sql.Int, id)
          .input('SoLuong', sql.Float, SoLuong)
          .input('DonGia', sql.Float, DonGia)
          .input('VAT', sql.Float, VAT || 0)
          .input('ThanhTien', sql.Float, newThanhTien)
          .query(\`
            UPDATE dbo.NHAP_VPP 
            SET SoLuong = @SoLuong, DonGia = @DonGia, VAT = @VAT, ThanhTien = @ThanhTien
            WHERE Id = @Id
          \`);
          
        await transaction.commit();
        res.json({ message: "Sửa thành công" });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).send(err.message || "Lỗi sửa đơn nhập");
    }
  });

  // =============================================
  // QUẢN LÝ ĐƠN XUẤT KHO
  // =============================================
  router.get('/export-list', authenticate, async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(\`
        SELECT x.Id, x.MaDon, v.MaCap3, v.TenVPP, x.SoLuong, t.DonGiaTon, (x.SoLuong * ISNULL(t.DonGiaTon, 0)) AS ThanhTien, x.NguoiNhan, x.MSNV, x.BoPhan, x.PheDuyet, x.NgayXuat
        FROM dbo.XUAT_VPP x
        JOIN dbo.V_VATTU v ON x.VppId = v.Id AND x.Loai = v.Loai
        LEFT JOIN dbo.TONKHO_VPP t ON x.VppId = t.VppId AND x.Loai = t.Loai
        ORDER BY x.NgayXuat DESC
      \`);
      res.json(result.recordset);
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi lấy danh sách đơn xuất");
    }
  });

  router.put('/export/approve', authenticate, async (req, res) => {
    const { ids, status } = req.body;
    if (!ids || !ids.length) return res.status(400).send("Không có ID");
    try {
      const pool = await poolPromise;
      const idList = ids.join(',');
      await pool.request().query(\`UPDATE dbo.XUAT_VPP SET PheDuyet = \${status} WHERE Id IN (\${idList})\`);
      res.json({ message: "Cập nhật thành công" });
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi cập nhật");
    }
  });

  router.delete('/export/:id', authenticate, async (req, res) => {
    const id = req.params.id;
    try {
      const pool = await poolPromise;
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const reqCheck = new sql.Request(transaction);
        const xuatData = await reqCheck.input('Id', sql.Int, id).query(\`SELECT VppId, Loai, SoLuong FROM dbo.XUAT_VPP WHERE Id = @Id AND PheDuyet = 0\`);
        if (xuatData.recordset.length === 0) throw new Error("Không tìm thấy hoặc đã được phê duyệt (khóa)");
        
        const data = xuatData.recordset[0];
        
        // Cộng lại tồn kho
        const reqUpdate = new sql.Request(transaction);
        await reqUpdate
          .input('VppId', sql.Int, data.VppId)
          .input('Loai', sql.VarChar, data.Loai)
          .input('Qty', sql.Float, data.SoLuong)
          .query(\`
            UPDATE dbo.TONKHO_VPP 
            SET SoLuongTon = SoLuongTon + @Qty
            WHERE VppId = @VppId AND Loai = @Loai
          \`);
          
        const reqDel = new sql.Request(transaction);
        await reqDel.input('Id', sql.Int, id).query(\`DELETE FROM dbo.XUAT_VPP WHERE Id = @Id\`);
        
        await transaction.commit();
        res.json({ message: "Xóa thành công" });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).send(err.message || "Lỗi xóa đơn xuất");
    }
  });
  
  router.put('/export/:id', authenticate, async (req, res) => {
    const id = req.params.id;
    const { SoLuong } = req.body;
    try {
      const pool = await poolPromise;
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const reqCheck = new sql.Request(transaction);
        const xuatData = await reqCheck.input('Id', sql.Int, id).query(\`SELECT VppId, Loai, SoLuong FROM dbo.XUAT_VPP WHERE Id = @Id AND PheDuyet = 0\`);
        if (xuatData.recordset.length === 0) throw new Error("Không tìm thấy hoặc đã được phê duyệt (khóa)");
        
        const oldData = xuatData.recordset[0];
        
        // Kiểm tra tồn kho có đủ không
        const reqStock = new sql.Request(transaction);
        const stockData = await reqStock
          .input('VppId', sql.Int, oldData.VppId)
          .input('Loai', sql.VarChar, oldData.Loai)
          .query(\`SELECT SoLuongTon FROM dbo.TONKHO_VPP WHERE VppId = @VppId AND Loai = @Loai\`);
          
        if (stockData.recordset.length === 0) throw new Error("Không tìm thấy tồn kho");
        const availableStock = stockData.recordset[0].SoLuongTon + oldData.SoLuong; // Trả lại kho trước khi trừ
        
        if (availableStock < SoLuong) {
           throw new Error(\`Không đủ tồn kho. Tối đa: \${availableStock}\`);
        }
        
        // Cộng lại cái cũ, trừ cái mới
        const reqUpdate = new sql.Request(transaction);
        await reqUpdate
          .input('VppId', sql.Int, oldData.VppId)
          .input('Loai', sql.VarChar, oldData.Loai)
          .input('OldQty', sql.Float, oldData.SoLuong)
          .input('NewQty', sql.Float, SoLuong)
          .query(\`
            UPDATE dbo.TONKHO_VPP 
            SET SoLuongTon = SoLuongTon + @OldQty - @NewQty
            WHERE VppId = @VppId AND Loai = @Loai
          \`);
          
        const reqSave = new sql.Request(transaction);
        await reqSave
          .input('Id', sql.Int, id)
          .input('SoLuong', sql.Float, SoLuong)
          .query(\`
            UPDATE dbo.XUAT_VPP 
            SET SoLuong = @SoLuong
            WHERE Id = @Id
          \`);
          
        await transaction.commit();
        res.json({ message: "Sửa thành công" });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).send(err.message || "Lỗi sửa đơn xuất");
    }
  });
`;

code = code.replace(
  `// =============================================\r\n  // IMPORT EXCEL\r\n  // =============================================`,
  `${newRoutes}\n  // =============================================\n  // IMPORT EXCEL\n  // =============================================`
);
code = code.replace(
  `// =============================================\n  // IMPORT EXCEL\n  // =============================================`,
  `${newRoutes}\n  // =============================================\n  // IMPORT EXCEL\n  // =============================================`
);

fs.writeFileSync(filePath, code);
console.log("Updated vppRoutes.js successfully");
