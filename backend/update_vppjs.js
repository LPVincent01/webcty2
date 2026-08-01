const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'frontend', 'vpp', 'vpp.js');
let js = fs.readFileSync(filePath, 'utf8');

// 1. Sidebar toggles
const sidebarToggleLogic = `
  // Sidebar toggles for Nhap Kho and Xuat Kho
  const toggleNhapKho = document.getElementById("toggleNhapKho");
  const submenuNhapKho = document.getElementById("submenuNhapKho");
  const iconNhapKho = document.getElementById("iconNhapKho");
  if (toggleNhapKho) {
    toggleNhapKho.addEventListener("click", () => {
      if (submenuNhapKho.style.display === "none") {
        submenuNhapKho.style.display = "block";
        iconNhapKho.className = "fas fa-chevron-down";
      } else {
        submenuNhapKho.style.display = "none";
        iconNhapKho.className = "fas fa-chevron-right";
      }
    });
  }

  const toggleXuatKho = document.getElementById("toggleXuatKho");
  const submenuXuatKho = document.getElementById("submenuXuatKho");
  const iconXuatKho = document.getElementById("iconXuatKho");
  if (toggleXuatKho) {
    toggleXuatKho.addEventListener("click", () => {
      if (submenuXuatKho.style.display === "none") {
        submenuXuatKho.style.display = "block";
        iconXuatKho.className = "fas fa-chevron-down";
      } else {
        submenuXuatKho.style.display = "none";
        iconXuatKho.className = "fas fa-chevron-right";
      }
    });
  }
`;
js = js.replace('// Sidebar navigation', '// Sidebar navigation\n' + sidebarToggleLogic);

// 2. Fetch list data on section click
const loadListLogic = `
      const targetId = \`vpp-\${link.dataset.section}Section\`;
      
      // Load data if it's the new lists
      if (link.dataset.section === 'importList') {
        loadImportList();
      } else if (link.dataset.section === 'exportList') {
        loadExportList();
      }
`;
js = js.replace('const targetId = `vpp-${link.dataset.section}Section`;', loadListLogic);

// 3. The complex logic for the lists
const newListsLogic = `
// =============================================
// DANH SÁCH ĐƠN NHẬP KHO
// =============================================
let importListData = [];

async function loadImportList() {
  try {
    const res = await fetch(\`\${API_BASE}/vpp/import-list\`, {
      headers: { "Authorization": "Bearer " + currentToken }
    });
    if (!res.ok) throw new Error("Failed to fetch import list");
    importListData = await res.json();
    renderImportList(importListData);
  } catch (err) {
    console.error(err);
  }
}

function renderImportList(data) {
  const tbody = document.querySelector("#importListTable tbody");
  tbody.innerHTML = data.map(item => {
    let statusHtml = item.PheDuyet === true 
      ? \`<div style="border: 2px solid red; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border-radius: 3px; margin: 0 auto; background: white;"><i class="fas fa-check" style="color:red; font-size: 14px;"></i></div>\`
      : \`<div style="border: 2px solid red; width: 18px; height: 18px; display: inline-block; border-radius: 3px; margin: 0 auto; background: white;"></div>\`;

    return \`
      <tr class="import-list-row" style="cursor: pointer; text-align: center;">
        <td style="text-align:center"><input type="checkbox" class="import-cb" value="\${item.Id}" data-status="\${item.PheDuyet ? 1 : 0}" /></td>
        <td>\${item.MaDon || ''}</td>
        <td>\${item.MaCap3 || ''}</td>
        <td>\${item.TenVPP || ''}</td>
        <td><strong>\${item.SoLuong || 0}</strong></td>
        <td>\${item.DonGia != null ? Math.round(item.DonGia).toLocaleString('vi-VN') : '-'}</td>
        <td>\${(item.DonGia != null && item.VAT != null) ? Math.round(item.DonGia * (1 + item.VAT/100)).toLocaleString('vi-VN') : '-'}</td>
        <td style="color:#0056b3; font-weight:bold">\${item.ThanhTien != null ? Math.round(item.ThanhTien).toLocaleString('vi-VN') : '-'}</td>
        <td>\${item.NguoiNhap || ''}</td>
        <td>\${item.NgayNhap ? new Date(item.NgayNhap).toLocaleString('vi-VN') : ''}</td>
        <td style="text-align:center">\${statusHtml}</td>
      </tr>
    \`;
  }).join("");

  updateImportToolbar();
}

document.addEventListener("change", (e) => {
  if (e.target.id === "selectAllImport") {
    document.querySelectorAll(".import-cb").forEach(cb => cb.checked = e.target.checked);
    updateImportToolbar();
  }
  if (e.target.classList.contains("import-cb")) {
    updateImportToolbar();
  }
  if (e.target.id === "selectAllExport") {
    document.querySelectorAll(".export-cb").forEach(cb => cb.checked = e.target.checked);
    updateExportToolbar();
  }
  if (e.target.classList.contains("export-cb")) {
    updateExportToolbar();
  }
});

// Click trên dòng để chọn checkbox
document.addEventListener("click", (e) => {
  const trImport = e.target.closest(".import-list-row");
  if (trImport && !e.target.closest("input") && !e.target.closest("button")) {
    const cb = trImport.querySelector(".import-cb");
    if(cb) {
      cb.checked = !cb.checked;
      updateImportToolbar();
    }
  }

  const trExport = e.target.closest(".export-list-row");
  if (trExport && !e.target.closest("input") && !e.target.closest("button")) {
    const cb = trExport.querySelector(".export-cb");
    if(cb) {
      cb.checked = !cb.checked;
      updateExportToolbar();
    }
  }
});

function updateImportToolbar() {
  const checked = document.querySelectorAll(".import-cb:checked");
  const btnApprove = document.getElementById("btnImportListApprove");
  const btnUnlock = document.getElementById("btnImportListUnlock");
  const btnEdit = document.getElementById("btnImportListEdit");
  const btnDelete = document.getElementById("btnImportListDelete");
  
  if (checked.length === 0) {
    btnApprove.style.display = "none";
    btnUnlock.style.display = "none";
    btnEdit.style.display = "none";
    btnDelete.style.display = "none";
    return;
  }
  
  let allPending = true;
  let allApproved = true;
  checked.forEach(cb => {
    if(cb.dataset.status == "1") allPending = false;
    if(cb.dataset.status == "0") allApproved = false;
  });

  const isAdmin = localStorage.getItem("eam_role") === "admin";

  btnApprove.style.display = allPending ? "inline-block" : "none";
  btnUnlock.style.display = (isAdmin && allApproved) ? "inline-block" : "none";
  
  // Sửa/Xóa chỉ hiện khi tất cả đều chưa duyệt
  if (allPending) {
    btnDelete.style.display = "inline-block";
    btnEdit.style.display = checked.length === 1 ? "inline-block" : "none";
  } else {
    btnDelete.style.display = "none";
    btnEdit.style.display = "none";
  }
}

// Hành động Nhập Kho
document.getElementById("btnImportListApprove").addEventListener("click", async () => {
  const ids = Array.from(document.querySelectorAll(".import-cb:checked")).map(cb => cb.value);
  if(!ids.length) return;
  try {
    await fetch(\`\${API_BASE}/vpp/import/approve\`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentToken },
      body: JSON.stringify({ ids, status: 1 })
    });
    showAlert("Đã xác nhận thành công!", true);
    loadImportList();
    loadInventory();
  } catch(e) { console.error(e); }
});

document.getElementById("btnImportListUnlock").addEventListener("click", async () => {
  const ids = Array.from(document.querySelectorAll(".import-cb:checked")).map(cb => cb.value);
  if(!ids.length) return;
  try {
    await fetch(\`\${API_BASE}/vpp/import/approve\`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentToken },
      body: JSON.stringify({ ids, status: 0 })
    });
    showAlert("Đã mở khóa thành công!", true);
    loadImportList();
    loadInventory();
  } catch(e) { console.error(e); }
});

document.getElementById("btnImportListDelete").addEventListener("click", async () => {
  const ids = Array.from(document.querySelectorAll(".import-cb:checked")).map(cb => cb.value);
  if(!ids.length) return;
  if(!confirm("Bạn có chắc chắn muốn xóa " + ids.length + " dòng nhập kho này? Tồn kho sẽ bị trừ lại.")) return;
  
  try {
    for (let id of ids) {
      const res = await fetch(\`\${API_BASE}/vpp/import/\${id}\`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + currentToken }
      });
      if(!res.ok) {
        const text = await res.text();
        showAlert(text, false);
      }
    }
    showAlert("Đã xóa hoàn tất!", true);
    loadImportList();
    loadInventory();
  } catch(e) { console.error(e); }
});

// Edit Import
let currentEditImportId = null;
document.getElementById("btnImportListEdit").addEventListener("click", () => {
  const cb = document.querySelector(".import-cb:checked");
  if(!cb) return;
  const id = cb.value;
  const item = importListData.find(d => d.Id == id);
  if(!item) return;
  
  currentEditImportId = id;
  document.getElementById("editImportSoLuong").value = item.SoLuong || 0;
  document.getElementById("editImportDonGia").value = item.DonGia || 0;
  document.getElementById("editImportVAT").value = item.VAT || 0;
  
  document.getElementById("editImportModal").style.display = "block";
});
document.getElementById("closeEditImportModal").addEventListener("click", () => document.getElementById("editImportModal").style.display="none");
document.getElementById("btnCancelEditImport").addEventListener("click", () => document.getElementById("editImportModal").style.display="none");

document.getElementById("btnSaveEditImport").addEventListener("click", async () => {
  if(!currentEditImportId) return;
  const data = {
    SoLuong: parseFloat(document.getElementById("editImportSoLuong").value),
    DonGia: parseFloat(document.getElementById("editImportDonGia").value),
    VAT: parseFloat(document.getElementById("editImportVAT").value)
  };
  try {
    const res = await fetch(\`\${API_BASE}/vpp/import/\${currentEditImportId}\`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentToken },
      body: JSON.stringify(data)
    });
    if(res.ok) {
      showAlert("Lưu sửa đổi thành công!", true);
      document.getElementById("editImportModal").style.display = "none";
      loadImportList();
      loadInventory();
    } else {
      const msg = await res.text();
      showAlert(msg, false);
    }
  } catch(e) { console.error(e); }
});

// =============================================
// DANH SÁCH ĐƠN XUẤT KHO
// =============================================
let exportListData = [];

async function loadExportList() {
  try {
    const res = await fetch(\`\${API_BASE}/vpp/export-list\`, {
      headers: { "Authorization": "Bearer " + currentToken }
    });
    if (!res.ok) throw new Error("Failed to fetch export list");
    exportListData = await res.json();
    renderExportList(exportListData);
  } catch (err) {
    console.error(err);
  }
}

function renderExportList(data) {
  const tbody = document.querySelector("#exportListTable tbody");
  tbody.innerHTML = data.map(item => {
    let statusHtml = item.PheDuyet === true 
      ? \`<div style="border: 2px solid red; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border-radius: 3px; margin: 0 auto; background: white;"><i class="fas fa-check" style="color:red; font-size: 14px;"></i></div>\`
      : \`<div style="border: 2px solid red; width: 18px; height: 18px; display: inline-block; border-radius: 3px; margin: 0 auto; background: white;"></div>\`;

    return \`
      <tr class="export-list-row" style="cursor: pointer; text-align: center;">
        <td style="text-align:center"><input type="checkbox" class="export-cb" value="\${item.Id}" data-status="\${item.PheDuyet ? 1 : 0}" /></td>
        <td>\${item.MaDon || ''}</td>
        <td>\${item.MaCap3 || ''}</td>
        <td>\${item.TenVPP || ''}</td>
        <td><strong>\${item.SoLuong || 0}</strong></td>
        <td>\${item.DonGiaTon != null ? Math.round(item.DonGiaTon).toLocaleString('vi-VN') : '-'}</td>
        <td style="color:#0056b3; font-weight:bold">\${item.ThanhTien != null ? Math.round(item.ThanhTien).toLocaleString('vi-VN') : '-'}</td>
        <td>\${item.NguoiNhan || ''}</td>
        <td>\${item.MSNV || ''}</td>
        <td>\${item.BoPhan || ''}</td>
        <td>\${item.NgayXuat ? new Date(item.NgayXuat).toLocaleString('vi-VN') : ''}</td>
        <td style="text-align:center">\${statusHtml}</td>
      </tr>
    \`;
  }).join("");

  updateExportToolbar();
}

function updateExportToolbar() {
  const checked = document.querySelectorAll(".export-cb:checked");
  const btnApprove = document.getElementById("btnExportListApprove");
  const btnUnlock = document.getElementById("btnExportListUnlock");
  const btnEdit = document.getElementById("btnExportListEdit");
  const btnDelete = document.getElementById("btnExportListDelete");
  
  if (checked.length === 0) {
    btnApprove.style.display = "none";
    btnUnlock.style.display = "none";
    btnEdit.style.display = "none";
    btnDelete.style.display = "none";
    return;
  }
  
  let allPending = true;
  let allApproved = true;
  checked.forEach(cb => {
    if(cb.dataset.status == "1") allPending = false;
    if(cb.dataset.status == "0") allApproved = false;
  });

  const isAdmin = localStorage.getItem("eam_role") === "admin";

  btnApprove.style.display = allPending ? "inline-block" : "none";
  btnUnlock.style.display = (isAdmin && allApproved) ? "inline-block" : "none";
  
  // Sửa/Xóa chỉ hiện khi tất cả đều chưa duyệt
  if (allPending) {
    btnDelete.style.display = "inline-block";
    btnEdit.style.display = checked.length === 1 ? "inline-block" : "none";
  } else {
    btnDelete.style.display = "none";
    btnEdit.style.display = "none";
  }
}

// Hành động Xuất Kho
document.getElementById("btnExportListApprove").addEventListener("click", async () => {
  const ids = Array.from(document.querySelectorAll(".export-cb:checked")).map(cb => cb.value);
  if(!ids.length) return;
  try {
    await fetch(\`\${API_BASE}/vpp/export/approve\`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentToken },
      body: JSON.stringify({ ids, status: 1 })
    });
    showAlert("Đã xác nhận thành công!", true);
    loadExportList();
    loadInventory();
  } catch(e) { console.error(e); }
});

document.getElementById("btnExportListUnlock").addEventListener("click", async () => {
  const ids = Array.from(document.querySelectorAll(".export-cb:checked")).map(cb => cb.value);
  if(!ids.length) return;
  try {
    await fetch(\`\${API_BASE}/vpp/export/approve\`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentToken },
      body: JSON.stringify({ ids, status: 0 })
    });
    showAlert("Đã mở khóa thành công!", true);
    loadExportList();
    loadInventory();
  } catch(e) { console.error(e); }
});

document.getElementById("btnExportListDelete").addEventListener("click", async () => {
  const ids = Array.from(document.querySelectorAll(".export-cb:checked")).map(cb => cb.value);
  if(!ids.length) return;
  if(!confirm("Bạn có chắc chắn muốn xóa " + ids.length + " dòng xuất kho này? Hàng sẽ được trả lại kho.")) return;
  
  try {
    for (let id of ids) {
      const res = await fetch(\`\${API_BASE}/vpp/export/\${id}\`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + currentToken }
      });
      if(!res.ok) {
        const text = await res.text();
        showAlert(text, false);
      }
    }
    showAlert("Đã xóa hoàn tất!", true);
    loadExportList();
    loadInventory();
  } catch(e) { console.error(e); }
});

// Edit Export
let currentEditExportId = null;
document.getElementById("btnExportListEdit").addEventListener("click", () => {
  const cb = document.querySelector(".export-cb:checked");
  if(!cb) return;
  const id = cb.value;
  const item = exportListData.find(d => d.Id == id);
  if(!item) return;
  
  currentEditExportId = id;
  document.getElementById("editExportSoLuong").value = item.SoLuong || 0;
  
  document.getElementById("editExportModal").style.display = "block";
});
document.getElementById("closeEditExportModal").addEventListener("click", () => document.getElementById("editExportModal").style.display="none");
document.getElementById("btnCancelEditExport").addEventListener("click", () => document.getElementById("editExportModal").style.display="none");

document.getElementById("btnSaveEditExport").addEventListener("click", async () => {
  if(!currentEditExportId) return;
  const data = {
    SoLuong: parseFloat(document.getElementById("editExportSoLuong").value)
  };
  try {
    const res = await fetch(\`\${API_BASE}/vpp/export/\${currentEditExportId}\`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentToken },
      body: JSON.stringify(data)
    });
    if(res.ok) {
      showAlert("Lưu sửa đổi thành công!", true);
      document.getElementById("editExportModal").style.display = "none";
      loadExportList();
      loadInventory();
    } else {
      const msg = await res.text();
      showAlert(msg, false);
    }
  } catch(e) { console.error(e); }
});
`;

js = js + '\n' + newListsLogic;

fs.writeFileSync(filePath, js);
console.log("Updated vpp.js successfully!");
