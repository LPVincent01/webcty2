const fs = require('fs');

const routePath = 'c:/PC/Laptrinhweb/webcty2/backend/routes/vppRoutes.js';
let content = fs.readFileSync(routePath, 'utf8');

const newApis = `
  // Bổ sung API Quản lý Loại Vật Tư (Nhóm Cấp 2 - SANPHAM)
  router.post('/danhmuc/cap2', authenticate, async (req, res) => {
    try {
      const { maCap2, tenCap2, loaiVatTuId } = req.body;
      const pool = await poolPromise;
      // Check exist
      const check = await pool.request().input('MaCap2', require('mssql').NVarChar, maCap2).query('SELECT Id FROM dbo.SANPHAM WHERE MaCap2 = @MaCap2');
      if (check.recordset.length > 0) return res.status(400).send("Mã nhóm vật tư đã tồn tại");
      
      await pool.request()
        .input('MaCap2', require('mssql').NVarChar, maCap2)
        .input('TenCap2', require('mssql').NVarChar, tenCap2)
        .input('LoaiVatTuId', require('mssql').Int, loaiVatTuId)
        .query('INSERT INTO dbo.SANPHAM (MaCap2, TenCap2, LoaiVatTuId) VALUES (@MaCap2, @TenCap2, @LoaiVatTuId)');
      res.send("Thêm thành công");
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server");
    }
  });

  router.put('/danhmuc/cap2/:id', authenticate, async (req, res) => {
    try {
      const { tenCap2, loaiVatTuId } = req.body;
      const pool = await poolPromise;
      await pool.request()
        .input('Id', require('mssql').Int, req.params.id)
        .input('TenCap2', require('mssql').NVarChar, tenCap2)
        .input('LoaiVatTuId', require('mssql').Int, loaiVatTuId)
        .query('UPDATE dbo.SANPHAM SET TenCap2 = @TenCap2, LoaiVatTuId = @LoaiVatTuId WHERE Id = @Id');
      res.send("Sửa thành công");
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server");
    }
  });

  router.delete('/danhmuc/cap2/:id', authenticate, async (req, res) => {
    try {
      const pool = await poolPromise;
      await pool.request()
        .input('Id', require('mssql').Int, req.params.id)
        .query('DELETE FROM dbo.SANPHAM WHERE Id = @Id');
      res.send("Xóa thành công");
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server");
    }
  });
`;

if (!content.includes('/danhmuc/cap2/:id')) {
    content = content.replace("router.get('/danhmuc/cap2/:maCap2/vatpham'", newApis + "\n  router.get('/danhmuc/cap2/:maCap2/vatpham'");
    fs.writeFileSync(routePath, content, 'utf8');
    console.log("Added APIs");
} else {
    console.log("APIs already exist");
}
