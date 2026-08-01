const sql = require('mssql');
const config = { user: 'sa', password: 'Abc@123456!', server: 'localhost', database: 'QuanLyVanPhongPham', options: { encrypt: false, trustServerCertificate: true } };
(async () => {
    try {
        const pool = await sql.connect(config);
        await pool.request().query("INSERT INTO dbo.DANHMUC_CHUYENMAY (MaCap3, TenVPP, DonViTinh, GhiChu, SanPhamId, ThuongHieu, NhaCungCap, NguonMua) SELECT MaCap3, TenVPP, DonViTinh, GhiChu, SanPhamId, ThuongHieu, NhaCungCap, NguonMua FROM dbo.VANPHONGPHAM WHERE MaCap3 LIKE 'F08%'");
        await pool.request().query("DELETE FROM dbo.VANPHONGPHAM WHERE MaCap3 LIKE 'F08%'");
        console.log("OK");
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
})();
