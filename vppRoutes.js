const express = require('express');
const sql = require('mssql');

module.exports = function (poolPromise, authenticate) {
  const router = express.Router();

  // Lấy danh sách Văn phòng phẩm
  router.get('/items', authenticate, async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT 
          v.Id, v.MaVPP, v.TenVPP, v.DonViTinh, v.SoLuongTon, v.GhiChu, v.HinhAnh,
          ISNULL(n.DonGia, 0) AS DonGia,
          ISNULL(n.VAT, 0) AS VAT,
          CAST(CASE WHEN n.DonGia IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS HasImport
        FROM dbo.VANPHONGPHAM v
        OUTER APPLY (
          SELECT TOP 1 DonGia, VAT
          FROM dbo.NHAP_VPP
          WHERE VppId = v.Id
          ORDER BY NgayNhap DESC
        ) n
        ORDER BY v.TenVPP ASC
      `);
      res.json(result.recordset);
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi lấy danh sách VPP");
    }
  });

  // Thêm mới Văn phòng phẩm
  router.post('/items', authenticate, async (req, res) => {
    const { MaVPP, TenVPP, DonViTinh, GhiChu } = req.body;
    if (!TenVPP) return res.status(400).send("Thiếu Tên Văn phòng phẩm");
    
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('MaVPP', sql.NVarChar, MaVPP || '')
        .input('TenVPP', sql.NVarChar, TenVPP)
        .input('DonViTinh', sql.NVarChar, DonViTinh || '')
        .input('GhiChu', sql.NVarChar, GhiChu || '')
        .query(`
          INSERT INTO dbo.VANPHONGPHAM (MaVPP, TenVPP, DonViTinh, SoLuongTon, GhiChu)
          OUTPUT INSERTED.Id
          VALUES (@MaVPP, @TenVPP, @DonViTinh, 0, @GhiChu)
        `);
      res.json({ id: result.recordset[0].Id, message: "Thêm VPP thành công" });
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi thêm VPP");
    }
  });

  // Cập nhật Hình ảnh
  router.put('/items/:id/image', authenticate, express.json({limit: '10mb'}), async (req, res) => {
    const { HinhAnh } = req.body;
    try {
      const pool = await poolPromise;
      await pool.request()
        .input('Id', sql.Int, req.params.id)
        .input('HinhAnh', sql.VarChar(sql.MAX), HinhAnh || '')
        .query(`UPDATE dbo.VANPHONGPHAM SET HinhAnh = @HinhAnh WHERE Id = @Id`);
      res.send("Cập nhật hình ảnh thành công");
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi cập nhật hình ảnh");
    }
  });

  // Cập nhật thông tin chung VPP
  router.put('/items/:id', authenticate, express.json({limit: '10mb'}), async (req, res) => {
    const { TenVPP, DonViTinh, HinhAnh, DonGia, VAT } = req.body;
    try {
      const pool = await poolPromise;
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        await transaction.request()
          .input('Id', sql.Int, req.params.id)
          .input('TenVPP', sql.NVarChar, TenVPP)
          .input('DonViTinh', sql.NVarChar, DonViTinh || '')
          .input('HinhAnh', sql.VarChar(sql.MAX), HinhAnh || '')
          .query(`
            UPDATE dbo.VANPHONGPHAM 
            SET TenVPP = @TenVPP, DonViTinh = @DonViTinh, HinhAnh = @HinhAnh 
            WHERE Id = @Id
          `);

        // Update newest NHAP_VPP if present
        if (DonGia !== undefined && VAT !== undefined) {
          await transaction.request()
            .input('Id', sql.Int, req.params.id)
            .input('DonGia', sql.Float, parseFloat(DonGia) || 0)
            .input('VAT', sql.Float, parseFloat(VAT) || 0)
            .query(`
              WITH LatestNhap AS (
                SELECT TOP 1 DonGia, VAT
                FROM dbo.NHAP_VPP
                WHERE VppId = @Id
                ORDER BY NgayNhap DESC
              )
              UPDATE LatestNhap SET DonGia = @DonGia, VAT = @VAT;
            `);
        }
        await transaction.commit();
        res.send("Cập nhật thông tin thành công");
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi cập nhật VPP");
    }
  });

  // Xóa VPP
  router.delete('/items/:id', authenticate, async (req, res) => {
    try {
      const pool = await poolPromise;
      // Ktra xem có lịch sử nhập/xuất không
      const check = await pool.request()
        .input('Id', sql.Int, req.params.id)
        .query(`
          SELECT 
            (SELECT COUNT(*) FROM dbo.NHAP_VPP WHERE VppId = @Id) + 
            (SELECT COUNT(*) FROM dbo.XUAT_VPP WHERE VppId = @Id) AS Total
        `);
      
      if (check.recordset[0].Total > 0) {
        return res.status(400).send("Không thể xóa do đã có phát sinh nhập/xuất");
      }

      await pool.request()
        .input('Id', sql.Int, req.params.id)
        .query(`DELETE FROM dbo.VANPHONGPHAM WHERE Id = @Id`);
      res.send("Xóa thành công");
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi xóa VPP");
    }
  });

  // Lưu Phiếu Nhập VPP (Nhiều dòng cùng lúc)
  router.post('/import', authenticate, async (req, res) => {
    const { items } = req.body; // Array of items
    const user = req.user ? req.user.username : 'Unknown';

    if (!items || !items.length) {
      return res.status(400).send("Không có dữ liệu nhập");
    }

    try {
      const pool = await poolPromise;
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        const request = new sql.Request(transaction);
        
        for (let item of items) {
          // 1. Nếu chưa có VppId, tức là thêm mới VPP luôn từ form nhập
          let vppId = item.VppId;
          if (!vppId) {
             const vppInsert = await request
              .input('TenVPP', sql.NVarChar, item.TenVPP)
              .input('DonViTinh', sql.NVarChar, item.DonViTinh || '')
              .query(`
                INSERT INTO dbo.VANPHONGPHAM (TenVPP, DonViTinh, SoLuongTon)
                OUTPUT INSERTED.Id
                VALUES (@TenVPP, @DonViTinh, 0)
              `);
             vppId = vppInsert.recordset[0].Id;
             // Reset parameter for next loop
             request.parameters = {}; 
          }

          // 2. Lưu vào NHAP_VPP
          await request
            .input('VppId2', sql.Int, vppId)
            .input('SoLuong', sql.Float, item.SoLuong)
            .input('DonGia', sql.Float, item.DonGia)
            .input('VAT', sql.Float, item.VAT)
            .input('ThanhTien', sql.Float, item.ThanhTien)
            .input('NguoiNhap', sql.NVarChar, user)
            .input('GhiChuNhap', sql.NVarChar, item.GhiChu || '')
            .query(`
              INSERT INTO dbo.NHAP_VPP (VppId, SoLuong, DonGia, VAT, ThanhTien, NguoiNhap, GhiChu)
              VALUES (@VppId2, @SoLuong, @DonGia, @VAT, @ThanhTien, @NguoiNhap, @GhiChuNhap)
            `);
            
          request.parameters = {};

          // 3. Cập nhật Số lượng tồn
          await request
            .input('VppId3', sql.Int, vppId)
            .input('Qty', sql.Float, item.SoLuong)
            .query(`
              UPDATE dbo.VANPHONGPHAM 
              SET SoLuongTon = SoLuongTon + @Qty 
              WHERE Id = @VppId3
            `);
          request.parameters = {};
        }

        await transaction.commit();
        res.json({ message: "Nhập hàng thành công" });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi nhập VPP");
    }
  });

  // Lấy Lịch sử nhập (có thể không dùng nữa, thay bằng /history chung)
  router.get('/imports', authenticate, async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT n.Id, v.TenVPP, v.DonViTinh, n.SoLuong, n.DonGia, n.VAT, n.ThanhTien, n.NgayNhap, n.NguoiNhap, n.GhiChu
        FROM dbo.NHAP_VPP n
        JOIN dbo.VANPHONGPHAM v ON n.VppId = v.Id
        ORDER BY n.NgayNhap DESC
      `);
      res.json(result.recordset);
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi lấy lịch sử nhập VPP");
    }
  });

  // Lưu Phiếu Xuất VPP
  router.post('/export', authenticate, async (req, res) => {
    const { items } = req.body;
    const user = req.user ? req.user.username : 'Unknown';

    if (!items || !items.length) {
      return res.status(400).send("Không có dữ liệu xuất");
    }

    try {
      const pool = await poolPromise;
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        const request = new sql.Request(transaction);
        
        for (let item of items) {
          if (!item.VppId) throw new Error("Thiếu mã vật tư");
          
          // Kiểm tra tồn kho
          const checkStock = await request
            .input('IdCheck', sql.Int, item.VppId)
            .query(`SELECT SoLuongTon, TenVPP FROM dbo.VANPHONGPHAM WHERE Id = @IdCheck`);
            
          request.parameters = {};
          
          if(checkStock.recordset.length === 0) throw new Error("Không tìm thấy vật tư");
          if(checkStock.recordset[0].SoLuongTon < item.SoLuong) {
            throw new Error(`Vật tư [${checkStock.recordset[0].TenVPP}] không đủ tồn kho (Còn: ${checkStock.recordset[0].SoLuongTon})`);
          }

          // Lưu xuất kho
          await request
            .input('VppId', sql.Int, item.VppId)
            .input('SoLuong', sql.Float, item.SoLuong)
            .input('NguoiNhan', sql.NVarChar, item.NguoiNhan || '')
            .input('GhiChu', sql.NVarChar, item.GhiChu || '')
            .query(`
              INSERT INTO dbo.XUAT_VPP (VppId, SoLuong, NguoiNhan, GhiChu)
              VALUES (@VppId, @SoLuong, @NguoiNhan, @GhiChu)
            `);
          request.parameters = {};

          // Trừ tồn kho
          await request
            .input('VppIdUpdate', sql.Int, item.VppId)
            .input('Qty', sql.Float, item.SoLuong)
            .query(`
              UPDATE dbo.VANPHONGPHAM 
              SET SoLuongTon = SoLuongTon - @Qty 
              WHERE Id = @VppIdUpdate
            `);
          request.parameters = {};
        }

        await transaction.commit();
        res.json({ message: "Xuất kho thành công" });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).send(err.message || "Lỗi server khi xuất VPP");
    }
  });

  // Lịch sử chung (Nhập + Xuất)
  router.get('/history', authenticate, async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT 
          v.MaVPP,
          'NHAP' AS Loai, 
          v.TenVPP, 
          n.SoLuong, 
          n.DonGia,
          n.VAT,
          n.ThanhTien,
          n.NguoiNhap AS NguoiThucHien, 
          '' AS NguoiNhan, 
          n.GhiChu,
          n.NgayNhap AS ThoiGian
        FROM dbo.NHAP_VPP n
        JOIN dbo.VANPHONGPHAM v ON n.VppId = v.Id
        
        UNION ALL
        
        SELECT 
          v.MaVPP,
          'XUAT' AS Loai, 
          v.TenVPP, 
          x.SoLuong, 
          NULL AS DonGia,
          NULL AS VAT,
          NULL AS ThanhTien,
          '' AS NguoiThucHien, 
          x.NguoiNhan, 
          x.GhiChu,
          x.NgayXuat AS ThoiGian
        FROM dbo.XUAT_VPP x
        JOIN dbo.VANPHONGPHAM v ON x.VppId = v.Id
        
        ORDER BY ThoiGian DESC
      `);
      res.json(result.recordset);
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi lấy lịch sử VPP");
    }
  });

  return router;
};
