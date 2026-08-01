const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'frontend', 'vpp', 'index.html');
let html = fs.readFileSync(filePath, 'utf8');

const newSections = `
        <!-- Section: Danh sách đơn nhập -->
        <section class="content-section" id="vpp-importListSection" style="display: none;">
          <div class="table-header" style="display: flex; flex-wrap: nowrap; justify-content: space-between; align-items: stretch; padding-bottom: 1rem; border-bottom: 1px solid #eee; margin-bottom: 15px; gap: 20px;">
            <div style="display: flex; flex-direction: column; gap: 12px; flex: 1 1 auto; min-width: 0;">
              <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;"><span class="table-title">Danh Sách Đơn Nhập Kho</span></h3>
              <div class="table-filters" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
                <input type="text" id="filterImportMaDon" placeholder="Mã Đơn" style="padding: 0 10px; border-radius: 8px; height: 36px; border: 1px solid #ddd; outline: none; font-size: 0.9rem;" />
              </div>
            </div>
            <div class="table-actions" style="display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; align-items: flex-end; padding-left: 20px; border-left: 1px solid #e2e8f0; flex: 0 0 auto; max-width: 550px;">
              <button class="btn btn-primary" id="btnImportListApprove" style="display: none;"><i class="fas fa-check"></i> Xác nhận</button>
              <button class="btn btn-secondary" id="btnImportListUnlock" style="display: none;"><i class="fas fa-unlock"></i> Mở khóa</button>
              <button class="btn btn-warning" id="btnImportListEdit" style="display: none;"><i class="fas fa-edit"></i> Sửa</button>
              <button class="btn btn-danger" id="btnImportListDelete" style="display: none;"><i class="fas fa-trash"></i> Xóa</button>
            </div>
          </div>
          <div class="table-container">
            <table class="data-table" id="importListTable">
              <thead>
                <tr>
                  <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllImport" /></th>
                  <th>Mã Đơn</th>
                  <th>Mã Vật Tư</th>
                  <th>Tên Vật Tư</th>
                  <th>Số Lượng</th>
                  <th>Đơn Giá</th>
                  <th>Đơn Giá (VAT)</th>
                  <th>Thành Tiền</th>
                  <th>Người Nhập</th>
                  <th>Thời Gian</th>
                  <th>Phê Duyệt</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </section>

        <!-- Section: Danh sách đơn xuất -->
        <section class="content-section" id="vpp-exportListSection" style="display: none;">
          <div class="table-header" style="display: flex; flex-wrap: nowrap; justify-content: space-between; align-items: stretch; padding-bottom: 1rem; border-bottom: 1px solid #eee; margin-bottom: 15px; gap: 20px;">
            <div style="display: flex; flex-direction: column; gap: 12px; flex: 1 1 auto; min-width: 0;">
              <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;"><span class="table-title">Danh Sách Đơn Xuất Kho</span></h3>
              <div class="table-filters" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
                <input type="text" id="filterExportMaDon" placeholder="Mã Đơn" style="padding: 0 10px; border-radius: 8px; height: 36px; border: 1px solid #ddd; outline: none; font-size: 0.9rem;" />
              </div>
            </div>
            <div class="table-actions" style="display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; align-items: flex-end; padding-left: 20px; border-left: 1px solid #e2e8f0; flex: 0 0 auto; max-width: 550px;">
              <button class="btn btn-primary" id="btnExportListApprove" style="display: none;"><i class="fas fa-check"></i> Xác nhận</button>
              <button class="btn btn-secondary" id="btnExportListUnlock" style="display: none;"><i class="fas fa-unlock"></i> Mở khóa</button>
              <button class="btn btn-warning" id="btnExportListEdit" style="display: none;"><i class="fas fa-edit"></i> Sửa</button>
              <button class="btn btn-danger" id="btnExportListDelete" style="display: none;"><i class="fas fa-trash"></i> Xóa</button>
            </div>
          </div>
          <div class="table-container">
            <table class="data-table" id="exportListTable">
              <thead>
                <tr>
                  <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllExport" /></th>
                  <th>Mã Đơn</th>
                  <th>Mã Vật Tư</th>
                  <th>Tên Vật Tư</th>
                  <th>Số Lượng</th>
                  <th>Đơn Giá(Tồn)</th>
                  <th>Thành Tiền(Tồn)</th>
                  <th>Người Nhận</th>
                  <th>MSNV</th>
                  <th>Bộ Phận</th>
                  <th>Thời Gian</th>
                  <th>Phê Duyệt</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </section>
        
        <!-- Modal Edit Import -->
        <div id="editImportModal" class="modal">
          <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
              <h2>Sửa dòng nhập kho</h2>
              <span class="close" id="closeEditImportModal">&times;</span>
            </div>
            <div class="form-grid" style="grid-template-columns: 1fr; padding: 15px;">
              <div class="form-group">
                <label>Số lượng</label>
                <input type="number" id="editImportSoLuong" class="form-control" />
              </div>
              <div class="form-group">
                <label>Đơn giá</label>
                <input type="number" id="editImportDonGia" class="form-control" />
              </div>
              <div class="form-group">
                <label>VAT (%)</label>
                <input type="number" id="editImportVAT" class="form-control" />
              </div>
            </div>
            <div class="form-actions" style="justify-content: flex-end; padding: 15px; border-top: 1px solid #eee;">
              <button class="btn btn-secondary" id="btnCancelEditImport">Hủy</button>
              <button class="btn btn-primary" id="btnSaveEditImport">Lưu thay đổi</button>
            </div>
          </div>
        </div>
        
        <!-- Modal Edit Export -->
        <div id="editExportModal" class="modal">
          <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
              <h2>Sửa dòng xuất kho</h2>
              <span class="close" id="closeEditExportModal">&times;</span>
            </div>
            <div class="form-grid" style="grid-template-columns: 1fr; padding: 15px;">
              <div class="form-group">
                <label>Số lượng</label>
                <input type="number" id="editExportSoLuong" class="form-control" />
              </div>
            </div>
            <div class="form-actions" style="justify-content: flex-end; padding: 15px; border-top: 1px solid #eee;">
              <button class="btn btn-secondary" id="btnCancelEditExport">Hủy</button>
              <button class="btn btn-primary" id="btnSaveEditExport">Lưu thay đổi</button>
            </div>
          </div>
        </div>
`;

if(!html.includes('id="vpp-importListSection"')) {
    html = html.replace(`<!-- Section: Lịch sử giao dịch -->`, `${newSections}\n\n        <!-- Section: Lịch sử giao dịch -->`);
    fs.writeFileSync(filePath, html);
    console.log("Updated HTML successfully!");
} else {
    console.log("Already updated HTML.");
}
