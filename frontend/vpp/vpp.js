const API_BASE = "/api";
let currentToken = localStorage.getItem("eam_token");
let currentUser = localStorage.getItem("eam_user");
let currentDisplayName = localStorage.getItem("eam_displayName");
let vppItems = [];
let cmItems = []; // Danh sách VPP lưu cache
let vppInventoryItems = []; // Danh sách tồn kho
let importRowCount = 0;
let exportRowCount = 0;

// DOM Elements
const loginPage = document.getElementById("loginPage");
const loginForm = document.getElementById("loginForm");
const appContainer = document.getElementById("appContainer");

// Show login form on click
if (loginPage && loginForm) {
  loginPage.addEventListener("click", () => {
    if (loginForm.classList.contains("hidden")) {
      loginForm.classList.remove("hidden");
    }
  });
}

// --- Setup ---
function showAlert(message, isSuccess) {
  const el = document.createElement("div");
  el.className = `alert ${isSuccess ? "alert-success" : "alert-danger"}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add("fade-out");
    setTimeout(() => el.remove(), 500);
  }, 3000);
}

document.addEventListener("DOMContentLoaded", () => {
  if (currentToken) {
    showApp();
    loadVppItems();
    loadInventory();
  } else {
    showLogin();
  }
  
  setupEvents();
  addImportRow(); // Add first row default
  addExportRow();
  loadHistoryData();
});

function setupEvents() {
  // Login
  document.getElementById("loginBtn").addEventListener("click", handleLogin);
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("eam_token");
    localStorage.removeItem("eam_user");
    localStorage.removeItem("eam_role");
    localStorage.removeItem("eam_displayName");
    window.location.href = "index.html";
  });

  // Sidebar navigation

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

  
  const toggleThongTin = document.getElementById("toggleThongTinVatTu");
  const submenu = document.getElementById("submenuThongTinVatTu");
  const icon = document.getElementById("iconThongTinVatTu");
  if (toggleThongTin) {
    toggleThongTin.addEventListener("click", () => {
      if (submenu.style.display === "none") {
        submenu.style.display = "block";
        icon.className = "fas fa-chevron-up";
      } else {
        submenu.style.display = "none";
        icon.className = "fas fa-chevron-down";
      }
    });
  }

  document.querySelectorAll(".sidebar-menu a").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".sidebar-menu a").forEach(a => a.classList.remove("active"));
      link.classList.add("active");
      
      // Remove animation classes from all sections first
      document.querySelectorAll(".content-section").forEach(sec => {
        sec.querySelectorAll(".table-container, .card, .chart-container").forEach(el => el.classList.remove("animate-in"));
        sec.style.display = "none";
      });
      
      
      const targetId = `vpp-${link.dataset.section}Section`;
      
      // Load data if it's the new lists
      if (link.dataset.section === 'importList') {
        loadImportList();
      } else if (link.dataset.section === 'exportList') {
        loadExportList();
      } else if (link.dataset.section === 'loaiVatTu') {
        fetchLoaiVatTu();
      }

      const targetSec = document.getElementById(targetId);
      if(targetSec) {
        targetSec.style.display = "block";
        // Add animation class to elements in the new section
        const elementsToAnimate = targetSec.querySelectorAll(".table-container, .card, .chart-container");
        elementsToAnimate.forEach(el => el.classList.add("animate-in"));
      }
    });
  });

  // Import table events
  document.getElementById("addImportRowBtn").addEventListener("click", addImportRow);
  document.getElementById("saveImportBtn").addEventListener("click", saveImportData);
  if(document.getElementById("refreshVppBtn")) {
    document.getElementById("refreshVppBtn").addEventListener("click", async () => {
      await loadVppItems();
      await loadInventory();
      await loadHistoryData();
      showAlert("Dữ liệu đã được cập nhật", true);
    });
  }
  
  if(document.getElementById("btnRestoreImportData")) {
    document.getElementById("btnRestoreImportData").addEventListener("click", async () => {
      await loadVppItems();
      showAlert("Dữ liệu đã được cập nhật", true);
    });
  }

  // Add VPP Modal
  const addModal = document.getElementById("addVppModal");
  document.getElementById("addVppBtn").addEventListener("click", () => {
    window.currentAddType = 'VPP';
    if(document.getElementById("addModalTitle")) document.getElementById("addModalTitle").innerText = 'Thêm Văn Phòng Phẩm Mới';
    addModal.style.display = "flex";
    loadCap2Dropdown();
  });
  document.getElementById("closeAddVppModal").addEventListener("click", () => {
    addModal.style.display = "none";
  });
  document.getElementById("cancelAddVppBtn").addEventListener("click", () => {
    addModal.style.display = "none";
  });
  document.getElementById("saveAddVppBtn").addEventListener("click", saveNewVpp);

  // Export table events
  document.getElementById("addExportRowBtn").addEventListener("click", addExportRow);
  document.getElementById("saveExportBtn").addEventListener("click", saveExportData);
  
  // Thêm logic Tra cứu Danh mục VPP
  
  // Thêm logic Tra cứu Danh mục Chuyền May
  if(document.getElementById("btnFilterCmList")) {
    document.getElementById("btnFilterCmList").addEventListener("click", applyCmFilters);
    document.getElementById("btnClearCmFilter").addEventListener("click", clearCmFilters);
  }

  // Nút Thêm Chuyền May
  if(document.getElementById("addCmBtn")) {
    document.getElementById("addCmBtn").addEventListener("click", () => {
      window.currentAddType = 'CM';
      if(document.getElementById("addModalTitle")) document.getElementById("addModalTitle").innerText = 'Thêm mới Vật tư Chuyền May';
      document.getElementById("addVppModal").style.display = "flex";
      // Chuyền may uses standard grouping or no grouping, but we should load the dropdown just in case it's used
      loadCap2Dropdown();
    });
  }
  
  window.editCm = async function(id) {
    const item = cmItems.find(x => x.Id === id);
    if (!item) return;

    try {
      const res = await fetch(`/api/vpp/check-lock/${id}`, {
        headers: { "Authorization": `Bearer ${currentToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.isLocked) {
          const maVT = item.MaCap3 || id;
          if (data.lockedNhap && data.lockedXuat) {
            showAlert(`Vui lòng mở khóa tất cả các Đơn Nhập Kho và Đơn Xuất Kho của Mã Vật Tư ${maVT} này trước khi chỉnh sửa.`, false);
          } else if (data.lockedNhap) {
            showAlert(`Vui lòng mở khóa Đơn Nhập Kho của Mã Vật Tư ${maVT} này trước khi chỉnh sửa.`, false);
          }
          return;
        }
      }
    } catch(err) {
      console.error("Lỗi kiểm tra trạng thái khóa:", err);
    }

    const newName = prompt("Sửa tên Chuyền May:", item.TenVPP);
    if(newName) {
       await fetch('/api/vpp/cm/items/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
          body: JSON.stringify({ TenVPP: newName, ThuongHieu: item.ThuongHieu, NhaCungCap: item.NhaCungCap, DonViTinh: item.DonViTinh })
       });
       loadCmItems();
    }
  };
  
  window.deleteCm = async function(id) {
    if(confirm("Bạn có chắc muốn xóa?")) {
       await fetch('/api/vpp/cm/items/' + id, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + currentToken }
       });
       loadCmItems();
    }
  };

  if(document.getElementById("btnFilterVppList")) {
    document.getElementById("btnFilterVppList").addEventListener("click", applyVppFilters);
    document.getElementById("btnClearVppFilter").addEventListener("click", clearVppFilters);
  }

  // Thêm logic Tra cứu Lịch sử
  if(document.getElementById("btnFilterHistoryList")) {
    document.getElementById("btnFilterHistoryList").addEventListener("click", applyHistoryFilters);
    document.getElementById("btnClearHistoryFilter").addEventListener("click", clearHistoryFilters);
  }

  // Modal Import Excel & Dropdown
  const importModal = document.getElementById("importExcelModal");
  const excelDropdownContent = document.getElementById("excelDropdownContent");
  
  // Toggle dropdown khi click nút Excel
  // Modal Import Excel & Dropdown cho Chuyền May
  const cmExcelDropdownContent = document.getElementById("cmExcelDropdownContent");
  
  if (document.getElementById("btnCmExcelDropdown")) {
    document.getElementById("btnCmExcelDropdown").addEventListener("click", (e) => {
      e.stopPropagation();
      if (cmExcelDropdownContent.style.display === "block") {
        cmExcelDropdownContent.style.display = "none";
      } else {
        cmExcelDropdownContent.style.display = "block";
      }
    });
  }

  if (cmExcelDropdownContent) {
    cmExcelDropdownContent.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  window.addEventListener("click", () => {
    if (cmExcelDropdownContent && cmExcelDropdownContent.style.display === "block") {
      cmExcelDropdownContent.style.display = "none";
    }
  });

  if (document.getElementById("btnCmOpenImportModal")) {
    document.getElementById("btnCmOpenImportModal").addEventListener("click", () => {
      cmExcelDropdownContent.style.display = "none";
      document.getElementById("importExcelFile").value = "";
      document.getElementById("importExcelFile").click();
    });
  }
  
  if (document.getElementById("btnCmExportExcel")) {
    document.getElementById("btnCmExportExcel").addEventListener("click", () => {
      cmExcelDropdownContent.style.display = "none";
      if (!cmItems || cmItems.length === 0) {
        alert("Không có dữ liệu để xuất Excel");
        return;
      }
      exportTableToExcel(cmItems, "Danh_Muc_Chuyen_May");
    });
  }

  if (document.getElementById("btnExcelDropdown")) {
    document.getElementById("btnExcelDropdown").addEventListener("click", (e) => {
      e.stopPropagation();
      if (excelDropdownContent.style.display === "block") {
        excelDropdownContent.style.display = "none";
      } else {
        excelDropdownContent.style.display = "block";
      }
    });
  }

  // Ngăn click bên trong dropdown lan ra window (nguyên nhân gốc khiến Import không hoạt động)
  if (excelDropdownContent) {
    excelDropdownContent.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  // Đóng dropdown khi click ra ngoài
  window.addEventListener("click", () => {
    if (excelDropdownContent && excelDropdownContent.style.display === "block") {
      excelDropdownContent.style.display = "none";
    }
  });

  // Nút Import Excel — mở hộp thoại chọn file (ẩn modal phụ)
  if (document.getElementById("btnOpenImportModal")) {
    document.getElementById("btnOpenImportModal").addEventListener("click", () => {
      excelDropdownContent.style.display = "none";
      // Reset input file trước khi mở để đảm bảo sự kiện change luôn được kích hoạt
      document.getElementById("importExcelFile").value = "";
      document.getElementById("importExcelFile").click();
    });
  }

  // Khi người dùng đã chọn file từ hộp thoại của hệ điều hành
  const importFileInput = document.getElementById("importExcelFile");
  if (importFileInput) {
    importFileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        // Tự động gọi hàm import mà không cần hiện modal
        handleImportExcel();
      }
    });
  }

  // Nút Excelout — xuất file (CHỈ 1 listener duy nhất)
  if (document.getElementById("btnExportExcel")) {
    document.getElementById("btnExportExcel").addEventListener("click", () => {
      excelDropdownContent.style.display = "none";
      handleExportExcel();
    });
  }

  // Các nút của modal import cũ đã được xóa bỏ

  // Toggle password visibility
  const togglePassword = document.getElementById("togglePassword");
  const passwordInput = document.getElementById("password");
  if (togglePassword && passwordInput) {
    togglePassword.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
      passwordInput.setAttribute("type", type);
      this.classList.toggle("fa-eye");
      this.classList.toggle("fa-eye-slash");
    });
  }
}

// --- Auth ---
async function handleLogin() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  if(!username || !password) return alert("Vui lòng nhập đủ thông tin");
  
  try {
    const res = await fetch(`${API_BASE}/vpp/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) throw new Error("Sai thông tin đăng nhập");
    const data = await res.json();
    localStorage.setItem("eam_token", data.token);
    localStorage.setItem("eam_user", data.username);
    localStorage.setItem("eam_role", data.role);
    localStorage.setItem("eam_displayName", data.displayName);
    currentToken = data.token;
    currentUser = data.username;
    currentDisplayName = data.displayName;
    showApp();
    loadVppItems();
    loadCmItems();
    loadInventory();
    loadHistoryData();
  } catch (err) {
    alert(err.message);
  }
}

function showApp() {
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("appContainer").style.display = "block";
  
  const displayName = typeof currentDisplayName !== 'undefined' ? currentDisplayName : localStorage.getItem("eam_displayName");
  const displayText = (displayName && displayName !== currentUser) ? `${displayName} ${currentUser}` : currentUser || "User";
  document.getElementById("currentUserText").textContent = displayText;
  
  const avatarName = displayName ? encodeURIComponent(displayName) : currentUser || "User";
  const userAvatar = document.getElementById("userAvatar");
  if(userAvatar) {
    userAvatar.src = `https://ui-avatars.com/api/?name=${avatarName}&background=3498db&color=fff`;
  }
}

function showLogin() {
  document.getElementById("appContainer").style.display = "none";
  document.getElementById("loginPage").style.display = "flex";
  document.getElementById("loginForm").classList.remove("hidden");
}

// --- Load Dropdown Cấp 2 cho Modal Thêm VPP ---
async function loadCap2Dropdown() {
  try {
    const res = await fetch(`${API_BASE}/vpp/danhmuc/cap2`, {
      headers: { "Authorization": `Bearer ${currentToken}` }
    });
    if (!res.ok) return;
    const cap2List = await res.json();
    const select = document.getElementById("newVppCode");
    const filterVppMa = document.getElementById("filterVppMa");
    const filterCmMa = document.getElementById("filterCmMa");
    const filterHistoryMa = document.getElementById("filterHistoryMa");
    
    if (select) {
      select.innerHTML = `<option value="">-- Chọn nhóm (mã tự sinh) --</option>`;
      cap2List.forEach(item => {
        if (!window.currentAddType) {
          select.innerHTML += `<option value="${item.MaCap2}">${item.MaCap2} - ${item.TenCap2}</option>`;
        } else if (window.currentAddType === 'VPP' && item.MaCap1 === 'F09') {
          select.innerHTML += `<option value="${item.MaCap2}">${item.MaCap2} - ${item.TenCap2}</option>`;
        } else if (window.currentAddType === 'CM' && item.MaCap1 === 'F08') {
          select.innerHTML += `<option value="${item.MaCap2}">${item.MaCap2} - ${item.TenCap2}</option>`;
        }
      });
    }
    
    if (filterVppMa) {
      filterVppMa.innerHTML = `<option value="">-- Mã Nhóm Vật Tư (Tất cả) --</option>`;
      cap2List.filter(i => i.MaCap1 === 'F09').forEach(item => {
        filterVppMa.innerHTML += `<option value="${item.MaCap2}">${item.MaCap2} - ${item.TenCap2}</option>`;
      });
    }

    if (filterCmMa) {
      filterCmMa.innerHTML = `<option value="">-- Mã Nhóm Vật Tư (Tất cả) --</option>`;
      cap2List.filter(i => i.MaCap1 === 'F08').forEach(item => {
        filterCmMa.innerHTML += `<option value="${item.MaCap2}">${item.MaCap2} - ${item.TenCap2}</option>`;
      });
    }

    if (filterHistoryMa) {
      filterHistoryMa.innerHTML = `<option value="">-- Mã Nhóm Vật Tư (Tất cả) --</option>`;
      cap2List.forEach(item => {
        filterHistoryMa.innerHTML += `<option value="${item.MaCap2}">${item.MaCap2} - ${item.TenCap2}</option>`;
      });
    }
  } catch (err) {
    console.error("Lỗi tải danh mục cấp 2:", err);
  }
}

// --- Fetch Data ---

async function loadCmItems() {
  try {
    const res = await fetch(`/api/vpp/cm/items`, { headers: { "Authorization": `Bearer ${currentToken}` } });
    if (res.ok) {
      cmItems = await res.json();
      filteredCmItems = [...cmItems];
      renderCmTable();
    }
  } catch (err) {
    console.error("Lỗi lấy danh sách CM", err);
  }
}

function renderCmTable() {
  const tbody = document.getElementById("cmTableBody");
  const pagination = document.getElementById("cmPagination");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  if (filteredCmItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Không có dữ liệu Chuyền May</td></tr>';
    if(pagination) pagination.innerHTML = '';
    return;
  }
  
  const totalPages = Math.ceil(filteredCmItems.length / CM_PER_PAGE);
  if (currentCmPage > totalPages && totalPages > 0) currentCmPage = totalPages;

  const startIndex = (currentCmPage - 1) * CM_PER_PAGE;
  const currentItems = filteredCmItems.slice(startIndex, startIndex + CM_PER_PAGE);

  tbody.innerHTML = currentItems.map((item, index) => {
    return `
    <tr>
      <td>${startIndex + index + 1}</td>
      <td style="text-align:center">
        ${item.HinhAnh 
          ? `<img src="${item.HinhAnh}" style="width:50px; height:50px; object-fit:contain; border-radius:4px; background-color: #fff;">` 
          : `<div style="width:50px; height:50px; background:#eee; display:flex; align-items:center; justify-content:center; border-radius:4px; font-size:10px; color:#999;">Chưa có</div>`}
      </td>
      <td>${item.MaCap3 || ""}</td>
      <td><strong>${item.TenVPP}</strong></td>
      <td>${item.ThuongHieu || ""}</td>
      <td>${item.NhaCungCap || ""}</td>
      <td>${item.NguonMua || 'VN'}</td>
      <td>${item.GhiChu || ""}</td>
      <td style="display: flex; gap: 5px; justify-content: center;">
        <button class="btn btn-warning btn-sm" onclick="openEditVppModal(${item.Id}, 'CM')" style="margin-right: 5px;" title="Chỉnh sửa"><i class="fas fa-pen"></i></button>
      </td>
    </tr>
    `;
  }).join("");

  if (pagination) {
    let pageHtml = "";
    for (let i = 1; i <= totalPages; i++) {
      pageHtml += `<button class="btn btn-sm ${i === currentCmPage ? 'btn-primary' : 'btn-secondary'}" onclick="changeCmPage(${i})" style="padding: 5px 10px; cursor: pointer; border: 1px solid #ccc; border-radius: 4px; background: ${i === currentCmPage ? '#3498db' : '#f8f9fa'}; color: ${i === currentCmPage ? '#fff' : '#333'};">${i}</button>`;
    }
    pagination.innerHTML = pageHtml;
  }
}

window.changeCmPage = function(page) {
  currentCmPage = page;
  renderCmTable();
};

async function loadVppItems() {
  if(!currentToken) return showLogin();
  try {
    const res = await fetch(`${API_BASE}/vpp/items`, {
      headers: { "Authorization": `Bearer ${currentToken}` }
    });
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem("eam_token");
      currentToken = null;
      return showLogin();
    }
    if (!res.ok) throw new Error("Lỗi tải danh sách VPP");
    vppItems = await res.json();
    applyVppFilters();
    refreshAllDropdowns();
    loadCap2Dropdown(); // Ensure filters are populated
  } catch (err) {
    console.error(err);
  }
}

function refreshAllDropdowns() {
  let optionsMaHtml = `<option value="">Chọn Mã</option>`;
  let optionsTenHtml = `<option value="">Chọn Tên</option>`;
  vppItems.forEach(item => {
    if(item.MaCap3) optionsMaHtml += `<option value="${item.MaCap3}">${item.MaCap3}</option>`;
    optionsTenHtml += `<option value="${item.TenVPP}">${item.TenVPP}</option>`;
  });
  
  // Import table
  document.querySelectorAll('#importTableBody tr').forEach(tr => {
    const maSel = tr.querySelector('.item-ma');
    const nameSel = tr.querySelector('.item-name');
    const valMa = maSel.value;
    const valName = nameSel.value;
    maSel.innerHTML = optionsMaHtml; maSel.value = valMa;
    
    // Update DVT and Name if an item is selected based on Ma
    const selectedItem = vppItems.find(x => x.MaCap3 === valMa);
    nameSel.innerHTML = optionsTenHtml; 
    
    if (selectedItem) {
      nameSel.value = selectedItem.TenVPP; // Auto update name if it changed
      tr.querySelector('.item-dvt').value = selectedItem.DonViTinh || '';
      if(tr.querySelector('.item-loai')) tr.querySelector('.item-loai').value = selectedItem.Loai || 'VPP';
    } else {
      nameSel.value = valName; // Fallback
    }
  });

  let optionsMaHtmlExport = `<option value="">Chọn Mã</option>`;
  let optionsTenHtmlExport = `<option value="">Chọn Tên</option>`;
  vppInventoryItems.forEach(item => {
    if(item.SoLuongTon > 0) {
      if(item.MaCap3) optionsMaHtmlExport += `<option value="${item.MaCap3}">${item.MaCap3}</option>`;
      optionsTenHtmlExport += `<option value="${item.TenVPP}">${item.TenVPP}</option>`;
    }
  });
  
  // Export table
  document.querySelectorAll('#exportTableBody tr').forEach(tr => {
    const maSel = tr.querySelector('.item-ma');
    const nameSel = tr.querySelector('.item-name');
    const valMa = maSel.value;
    const valName = nameSel.value;
    maSel.innerHTML = optionsMaHtmlExport; maSel.value = valMa;
    nameSel.innerHTML = optionsTenHtmlExport; nameSel.value = valName;
    
    // Update DVT and Ton if an item is selected
    const selectedItem = vppInventoryItems.find(x => x.MaCap3 === valMa || x.TenVPP === valName);
    if (selectedItem) {
      tr.querySelector('.item-dvt').value = selectedItem.DonViTinh || '';
      tr.querySelector('.item-ton').value = selectedItem.SoLuongTon || 0;
      tr.querySelector('.item-qty').max = selectedItem.SoLuongTon || 0;
      if(tr.querySelector('.item-loai')) tr.querySelector('.item-loai').value = selectedItem.Loai || 'VPP';
    }
  });
}

// --- API Lấy dữ liệu tồn kho ---
async function loadInventory() {
  if(!currentToken) return;
  try {
    const res = await fetch(`${API_BASE}/vpp/inventory`, {
      headers: { "Authorization": `Bearer ${currentToken}` }
    });
    if (!res.ok) throw new Error("Lỗi tải danh sách tồn kho");
    vppInventoryItems = await res.json();
    renderInventoryTable();
    refreshAllDropdowns();
  } catch (err) {
    console.error(err);
  }
}

function renderInventoryTable() {
  const tbody = document.getElementById("vppInventoryTableBody");
  if(!tbody) return;
  
  tbody.innerHTML = vppInventoryItems.map((item, idx) => {
    // Nếu DinhMuc = 0 hoặc chưa cài, tạm thời có thể hiển thị chính số lượng tồn, hoặc hiển thị giá trị DinhMuc thực tế.
    // Dựa theo KH: "cột này sẽ lấy số lượng theo cột Tồn Kho", ta có thể hiển thị item.SoLuongTon. Nhưng vì ta đã có trường DinhMuc, ta sẽ ưu tiên DinhMuc. Nếu chưa thiết lập thì hiển thị Tồn kho, hoặc luôn hiển thị DinhMuc.
    // Thực tế, yêu cầu gốc là: "cột này sẽ lấy số lượng theo cột Tồn Kho". Nên ta render số tồn, nhưng vì KH đồng ý thêm trường DinhMuc, ta có thể hiển thị item.DinhMuc.
    const dinhMucHienThi = (item.DinhMuc != null && item.DinhMuc !== 0) ? item.DinhMuc : (item.SoLuongTon || 0);

    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${item.MaCap3 || ''}</td>
        <td><strong>${item.TenVPP}</strong></td>
        <td>${item.DonGiaTon ? Math.round(item.DonGiaTon).toLocaleString('vi-VN') : '0'}</td>
        <td style="font-weight:bold; color:#d35400;">${item.SoLuongTon || 0} ${item.DonViTinh || ''}</td>
        <td style="font-weight:bold; color:#f39c12;">${dinhMucHienThi} ${item.DonViTinh || ''}</td>
        <td style="font-weight:bold; color:#27ae60;">${item.ThanhTienTon ? Math.round(item.ThanhTienTon).toLocaleString('vi-VN') : '0'} đ</td>
      </tr>
    `;
  }).join("");
}


let currentVppPage = 1;
const VPP_PER_PAGE = 10;
let filteredVppItems = [];

let currentCmPage = 1;
const CM_PER_PAGE = 10;
let filteredCmItems = [];

function applyVppFilters() {
  const ma = (document.getElementById("filterVppMa")?.value || "").toLowerCase();
  const ten = (document.getElementById("filterVppTen")?.value || "").toLowerCase();
  const brand = (document.getElementById("filterVppThuongHieu")?.value || "").toLowerCase();
  const ncc = (document.getElementById("filterVppNcc")?.value || "").toLowerCase();

  filteredVppItems = vppItems.filter(item => {
    const matchMa = (item.MaCap3 || "").toLowerCase().includes(ma);
    const matchTen = (item.TenVPP || "").toLowerCase().includes(ten);
    const matchBrand = (item.ThuongHieu || "").toLowerCase().includes(brand);
    const matchNcc = (item.NhaCungCap || "").toLowerCase().includes(ncc);
    return matchMa && matchTen && matchBrand && matchNcc;
  });
  currentVppPage = 1;
  renderVppTable();
}

function clearVppFilters() {
  if(document.getElementById("filterVppMa")) document.getElementById("filterVppMa").value = "";
  if(document.getElementById("filterVppTen")) document.getElementById("filterVppTen").value = "";
  if(document.getElementById("filterVppThuongHieu")) document.getElementById("filterVppThuongHieu").value = "";
  if(document.getElementById("filterVppNcc")) document.getElementById("filterVppNcc").value = "";
  applyVppFilters();
}

function applyCmFilters() {
  const ma = (document.getElementById("filterCmMa")?.value || "").toLowerCase();
  const ten = (document.getElementById("filterCmTen")?.value || "").toLowerCase();
  const brand = (document.getElementById("filterCmThuongHieu")?.value || "").toLowerCase();
  const ncc = (document.getElementById("filterCmNcc")?.value || "").toLowerCase();

  filteredCmItems = cmItems.filter(item => {
    const itemMa = (item.MaCap3 || "").toLowerCase();
    const itemTen = (item.TenVPP || "").toLowerCase();
    const itemBrand = (item.ThuongHieu || "").toLowerCase();
    const itemNcc = (item.NhaCungCap || "").toLowerCase();

    return (ma === "" || itemMa.startsWith(ma)) &&
           itemTen.includes(ten) &&
           itemBrand.includes(brand) &&
           itemNcc.includes(ncc);
  });

  currentCmPage = 1;
  renderCmTable();
}

function clearCmFilters() {
  if(document.getElementById("filterCmMa")) document.getElementById("filterCmMa").value = "";
  if(document.getElementById("filterCmTen")) document.getElementById("filterCmTen").value = "";
  if(document.getElementById("filterCmThuongHieu")) document.getElementById("filterCmThuongHieu").value = "";
  if(document.getElementById("filterCmNcc")) document.getElementById("filterCmNcc").value = "";
  applyCmFilters();
}

async function handleImportExcel() {
  const fileInput = document.getElementById("importExcelFile");
  if(!fileInput.files || fileInput.files.length === 0) {
    return alert("Vui lòng chọn file Excel");
  }

  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${API_BASE}/vpp/import-excel`, {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${currentToken}`
      },
      body: formData
    });
    
    if(!res.ok) {
      const errTxt = await res.text();
      throw new Error(errTxt);
    }
    
    const data = await res.json();
    alert(`Import thành công! Đã xử lý ${data.count} dòng dữ liệu.`);
    fileInput.value = "";
    loadVppItems();
    loadInventory();
    loadHistoryData();
  } catch(err) {
    alert("Lỗi Import: " + err.message);
  }
}

function handleExportExcel() {
  
  if (!vppItems || vppItems.length === 0) {
    return alert("Không có dữ liệu để xuất Excel.");
  }
  
  if (typeof XLSX === "undefined") {
    return alert("Thư viện Excel chưa được tải, vui lòng thử lại sau.");
  }

  const excelData = vppItems.map((item, index) => ({
    "STT": index + 1,
    "Mã Vật Tư": item.MaCap3 || "",
    "Tên Vật Tư": item.TenVPP || "",
    "Đơn Vị Tính": item.DonViTinh || "",
    "Thương Hiệu / Hãng": item.ThuongHieu || "",
    "Nhà Cung Cấp": item.NhaCungCap || "",
    "Ghi Chú": item.GhiChu || ""
  }));

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Danh_muc_VPP");
  
  XLSX.writeFile(workbook, "Danh_muc_VPP.xlsx");
}

function renderVppTable() {
  const tbody = document.getElementById("vppTableBody");
  const pagination = document.getElementById("vppPagination");
  if(!tbody) return;

  const totalPages = Math.ceil(filteredVppItems.length / VPP_PER_PAGE);
  if (currentVppPage > totalPages && totalPages > 0) currentVppPage = totalPages;

  const startIndex = (currentVppPage - 1) * VPP_PER_PAGE;
  const currentItems = filteredVppItems.slice(startIndex, startIndex + VPP_PER_PAGE);

  tbody.innerHTML = currentItems.map((item, index) => {
    const imgHtml = item.HinhAnh 
      ? `<img src="${item.HinhAnh}" style="width:50px; height:50px; object-fit:contain; border-radius:4px; background-color: #fff;">` 
      : `<div style="width:50px; height:50px; background:#eee; display:flex; align-items:center; justify-content:center; border-radius:4px; font-size:10px; color:#999;">Chưa có</div>`;

    return `
    <tr>
      <td>${startIndex + index + 1}</td>
      <td style="text-align:center">
        ${imgHtml}
      </td>
      <td>${item.MaCap3 || ''}</td>
      <td><strong>${item.TenVPP}</strong></td>
      <td>${item.ThuongHieu || ''}</td>
      <td>${item.NhaCungCap || ''}</td>
      <td>${item.NguonMua || 'VN'}</td>
      <td>${item.GhiChu || ''}</td>
      <td style="display: flex; gap: 5px; justify-content: center;">
        <button class="btn btn-warning btn-sm" onclick="openEditVppModal(${item.Id})" style="margin-right: 5px;" title="Chỉnh sửa"><i class="fas fa-pen"></i></button>
      </td>
    </tr>
  `}).join("");

  if (pagination) {
    let pageHtml = "";
    for (let i = 1; i <= totalPages; i++) {
      pageHtml += `<button class="btn btn-sm ${i === currentVppPage ? 'btn-primary' : 'btn-secondary'}" onclick="changeVppPage(${i})" style="padding: 5px 10px; cursor: pointer; border: 1px solid #ccc; border-radius: 4px; background: ${i === currentVppPage ? '#3498db' : '#f8f9fa'}; color: ${i === currentVppPage ? '#fff' : '#333'};">${i}</button>`;
    }
    pagination.innerHTML = pageHtml;
  }
}

window.changeVppPage = function(page) {
  currentVppPage = page;
  renderVppTable();
};

// Edit VPP Logic
async function openEditVppModal(id, type = 'VPP') {
  window.currentEditType = type;
  const item = type === 'VPP' ? vppItems.find(i => i.Id == id) : cmItems.find(i => i.Id == id);
  if(!item) return;

  const modalTitle = document.querySelector('#editVppModal h3') || document.querySelector('#editVppModal .modal-title') || document.getElementById('editVppModalTitle');
  if(modalTitle) {
      modalTitle.innerText = type === 'VPP' ? 'Chỉnh Sửa Văn Phòng Phẩm' : 'Chỉnh Sửa Vật Tư Chuyền May';
  }

  try {
    const res = await fetch(`/api/vpp/check-lock/${id}`, {
      headers: { "Authorization": `Bearer ${currentToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.isLocked) {
        const maVT = item.MaCap3 || id;
        if (data.lockedNhap && data.lockedXuat) {
          showAlert(`Vui lòng mở khóa tất cả các Đơn Nhập Kho và Đơn Xuất Kho của Mã Vật Tư ${maVT} này trước khi chỉnh sửa.`, false);
        } else if (data.lockedNhap) {
          showAlert(`Vui lòng mở khóa Đơn Nhập Kho của Mã Vật Tư ${maVT} này trước khi chỉnh sửa.`, false);
        }
        return;
      }
    }
  } catch(err) {
    console.error("Lỗi kiểm tra trạng thái khóa:", err);
  }

  document.getElementById('editVppId').value = item.Id;
  document.getElementById('editVppName').value = item.TenVPP || "";
  document.getElementById('editVppUnit').value = item.DonViTinh || "";
  document.getElementById('editVppBrand').value = item.ThuongHieu || "";
  document.getElementById('editVppSupplier').value = item.NhaCungCap || "";
  document.getElementById('editVppNote').value = item.GhiChu || "";
  
  

  
  
  if (item.HinhAnh) {
    document.getElementById('editVppImagePreview').src = item.HinhAnh;
    document.getElementById('editVppImagePreview').style.display = 'block';
    document.getElementById('editVppImagePlaceholder').style.display = 'none';
    document.getElementById('editVppImageBase64').value = item.HinhAnh;
  } else {
    document.getElementById('editVppImagePreview').style.display = 'none';
    document.getElementById('editVppImagePlaceholder').style.display = 'block';
    document.getElementById('editVppImageBase64').value = "";
  }

  if (document.getElementById('editVppImage')) {
    document.getElementById('editVppImage').value = "";
  }

  calculateEditPriceVat();
  document.getElementById('editVppModal').style.display = 'block';
}

function calculateEditPriceVat() {
  const priceEl = document.getElementById('editVppPrice');
  const vatEl = document.getElementById('editVppVat');
  const priceVatEl = document.getElementById('editVppPriceVat');
  
  if (priceEl && vatEl && priceVatEl) {
    const price = parseFloat(priceEl.value) || 0;
    const vat = parseFloat(vatEl.value) || 0;
    priceVatEl.value = price * (1 + vat / 100);
  }
}

if (document.getElementById('editVppPrice')) {
  document.getElementById('editVppPrice').addEventListener('input', calculateEditPriceVat);
}
if (document.getElementById('editVppVat')) {
  document.getElementById('editVppVat').addEventListener('input', calculateEditPriceVat);
}

if (document.getElementById('closeEditVppModal')) {
  document.getElementById('closeEditVppModal').addEventListener('click', () => {
    document.getElementById('editVppModal').style.display = 'none';
  });
}
if (document.getElementById('cancelEditVppBtn')) {
  document.getElementById('cancelEditVppBtn').addEventListener('click', () => {
    document.getElementById('editVppModal').style.display = 'none';
  });
}

if (document.getElementById('editVppImgContainer')) {
  document.getElementById('editVppImgContainer').addEventListener('paste', (e) => {
    e.preventDefault();
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf('image') === 0) {
        const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Str = event.target.result;
        document.getElementById('editVppImageBase64').value = base64Str;
        document.getElementById('editVppImagePreview').src = base64Str;
        document.getElementById('editVppImagePreview').style.display = 'block';
        document.getElementById('editVppImagePlaceholder').style.display = 'none';
      };
      reader.readAsDataURL(blob);
    }
  }
  });
}

if (document.getElementById('editVppImage')) {
  document.getElementById('editVppImage').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Str = event.target.result;
        document.getElementById('editVppImageBase64').value = base64Str;
        document.getElementById('editVppImagePreview').src = base64Str;
        document.getElementById('editVppImagePreview').style.display = 'block';
        document.getElementById('editVppImagePlaceholder').style.display = 'none';
        
        if (document.getElementById('editVppImage')) {
          document.getElementById('editVppImage').value = "";
        }
      };
      reader.readAsDataURL(file);
    }
  });
}

if (document.getElementById('saveEditVppBtn')) {
  document.getElementById('saveEditVppBtn').addEventListener('click', async () => {
  const id = document.getElementById('editVppId').value;
  const TenVPP = document.getElementById('editVppName').value.trim();
  if(!TenVPP) return showAlert("Vui lòng nhập tên vật tư", false);

  const payload = {
    TenVPP,
    DonViTinh: document.getElementById('editVppUnit').value.trim(),
    ThuongHieu: document.getElementById('editVppBrand').value.trim(),
    NhaCungCap: document.getElementById('editVppSupplier').value.trim(),
    GhiChu: document.getElementById('editVppNote').value.trim(),
    
    
    HinhAnh: document.getElementById('editVppImageBase64').value || ""
  };

  try {
    const endpoint = window.currentEditType === 'CM' ? `${API_BASE}/vpp/cm/items/${id}` : `${API_BASE}/vpp/items/${id}`;
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify(payload)
    });
    if(res.ok) {
      showAlert("Cập nhật thông tin thành công", true);
      document.getElementById('editVppModal').style.display = 'none';
      if (window.currentEditType === 'CM') {
        await loadCmItems();
      } else {
        await loadVppItems();
      }
    } else {
      showAlert("Lỗi khi cập nhật", false);
    }
  } catch(err) {
    console.error(err);
  }
});
}

async function saveNewVpp() {
  const code = document.getElementById("newVppCode").value.trim();
  const name = document.getElementById("newVppName").value.trim();
  const unit = document.getElementById("newVppUnit").value.trim();
  const note = document.getElementById("newVppNote").value.trim();

  if(!name) return alert("Vui lòng nhập Tên Vật Tư");

  try {
    const res = await fetch(`${API_BASE}/vpp/items`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${currentToken}` 
      },
      body: JSON.stringify({ 
        MaCap2: code, 
        TenVPP: name, 
        DonViTinh: unit, 
        GhiChu: note,
        ThuongHieu: document.getElementById("newVppBrand") ? document.getElementById("newVppBrand").value.trim() : "",
        NhaCungCap: document.getElementById("newVppSupplier") ? document.getElementById("newVppSupplier").value.trim() : ""
      })
    });
    
    if (res.status === 401 || res.status === 403) {
      alert("Phiên đăng nhập hết hạn, vui lòng đăng nhập lại.");
      localStorage.removeItem("eam_token");
      currentToken = null;
      return showLogin();
    }
    if(!res.ok) throw new Error("Lỗi khi thêm mới");
    
    document.getElementById("addVppModal").style.display = "none";
    
    // Clear inputs
    document.getElementById("newVppCode").value = "";
    document.getElementById("newVppName").value = "";
    document.getElementById("newVppUnit").value = "";
    document.getElementById("newVppNote").value = "";
    if (document.getElementById("newVppBrand")) document.getElementById("newVppBrand").value = "";
    if (document.getElementById("newVppSupplier")) document.getElementById("newVppSupplier").value = "";

    if (window.currentAddType === 'CM') {
      loadCmItems();
    } else {
      loadVppItems();
    }
  } catch(err) {
    alert(err.message);
  }
}

async function deleteVpp(id) {
  if(!confirm("Bạn có chắc chắn muốn xóa vật tư này?")) return;
  try {
    const res = await fetch(`${API_BASE}/vpp/items/${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${currentToken}` }
    });
    if(!res.ok) {
      const errTxt = await res.text();
      throw new Error(errTxt || "Lỗi khi xóa");
    }
    alert("Xóa thành công!");
    loadVppItems();
  } catch(err) {
    alert(err.message);
  }
}

// --- Import Logic ---
// importRowCount đã được khai báo ở đầu file
function addImportRow() {
  importRowCount++;
  const tbody = document.getElementById("importTableBody");
  const tr = document.createElement("tr");
  tr.id = `importRow_${importRowCount}`;
  
  let optionsMaHtml = `<option value="">Chọn Mã</option>`;
  let optionsTenHtml = `<option value="">Chọn Tên</option>`;
  vppItems.forEach(item => {
    if(item.MaCap3) optionsMaHtml += `<option value="${item.MaCap3}">${item.MaCap3}</option>`;
    optionsTenHtml += `<option value="${item.TenVPP}">${item.TenVPP}</option>`;
  });
  
  tr.innerHTML = `
    <td>${importRowCount}</td>
    <td>
      <select class="form-control item-ma" style="width:100%">
        ${optionsMaHtml}
      </select>
      <input type="hidden" class="item-id">
    </td>
    <td>
      <select class="form-control item-name" style="width:100%">
        ${optionsTenHtml}
      </select>
    </td>
    <td><input type="text" class="form-control item-dvt" placeholder="Cái/Hộp" style="width:100%"></td>
    <td><input type="number" class="form-control item-qty" value="1" min="1" style="width:100%"></td>
    <td><input type="number" class="form-control item-price" value="0" min="0" style="width:100%"></td>
    <td>
      <select class="form-control item-vat" style="width:100%">
        <option value="0">0%</option>
        <option value="5">5%</option>
        <option value="8">8%</option>
        <option value="10">10%</option>
      </select>
    </td>
    <td><input type="text" class="form-control item-price-vat" readonly style="width:100%; background:#f0f0f0"></td>
    <td><input type="text" class="form-control item-total" readonly style="width:100%; font-weight:bold; background:#e8f4f8; color:#0056b3;"></td>
    <td><input type="text" class="form-control item-note" style="width:100%"></td>
    <td><button class="btn btn-danger btn-sm" onclick="removeImportRow(${importRowCount})"><i class="fas fa-trash"></i></button></td>
  `;
  tbody.appendChild(tr);

  const qtyInput = tr.querySelector('.item-qty');
  const priceInput = tr.querySelector('.item-price');
  const vatInput = tr.querySelector('.item-vat');
  const maInput = tr.querySelector('.item-ma');
  const nameInput = tr.querySelector('.item-name');
  
  [qtyInput, priceInput, vatInput].forEach(el => {
    el.addEventListener('input', () => calculateRow(tr));
  });

  // Khi chọn Mã VPP
  maInput.addEventListener('change', (e) => {
    const val = e.target.value.trim();
    const item = vppItems.find(x => x.MaCap3 === val);
    if(item) {
      tr.querySelector('.item-id').value = item.Id;
      tr.querySelector('.item-name').value = item.TenVPP;
      tr.querySelector('.item-dvt').value = item.DonViTinh;
    }
  });

  // Khi chọn Tên VPP (phòng hờ)
  nameInput.addEventListener('change', (e) => {
    const val = e.target.value.trim();
    const item = vppItems.find(x => x.TenVPP === val);
    if(item) {
      tr.querySelector('.item-id').value = item.Id;
      tr.querySelector('.item-ma').value = item.MaCap3 || '';
      tr.querySelector('.item-dvt').value = item.DonViTinh;
    }
  });
}

function removeImportRow(id) {
  const row = document.getElementById(`importRow_${id}`);
  if(row) row.remove();
}

function calculateRow(tr) {
  const qty = parseFloat(tr.querySelector('.item-qty').value) || 0;
  const price = parseFloat(tr.querySelector('.item-price').value) || 0;
  const vatRate = parseFloat(tr.querySelector('.item-vat').value) || 0;
  
  const priceVat = price + (price * vatRate / 100);
  const total = qty * priceVat;
  
  tr.querySelector('.item-price-vat').value = priceVat.toLocaleString('vi-VN');
  tr.querySelector('.item-total').value = total.toLocaleString('vi-VN');
}

async function saveImportData() {
  const rows = document.querySelectorAll('#importTableBody tr');
  const items = [];
  
  for(let tr of rows) {
    const name = tr.querySelector('.item-name').value.trim();
    if(!name) continue; // Bỏ qua dòng trống
    
    items.push({
      VppId: tr.querySelector('.item-id').value,
      TenVPP: name,
      DonViTinh: tr.querySelector('.item-dvt').value,
      SoLuong: parseFloat(tr.querySelector('.item-qty').value) || 0,
      DonGia: parseFloat(tr.querySelector('.item-price').value) || 0,
      VAT: parseFloat(tr.querySelector('.item-vat').value) || 0,
      ThanhTien: parseFloat(tr.querySelector('.item-total').value.replace(/\./g, '').replace(/,/g, '')) || 0,
      GhiChu: tr.querySelector('.item-note').value
    });
  }

  if(items.length === 0) {
    return alert("Vui lòng nhập ít nhất 1 mặt hàng");
  }

  if(!confirm("Xác nhận lưu phiếu nhập này? Kho sẽ tự động cập nhật số lượng.")) return;

  try {
    const res = await fetch(`${API_BASE}/vpp/import`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${currentToken}` 
      },
      body: JSON.stringify({ items })
    });
    
    if (res.status === 401 || res.status === 403) {
      alert("Phiên đăng nhập hết hạn. Dữ liệu chưa được lưu, vui lòng đăng nhập lại.");
      localStorage.removeItem("eam_token");
      currentToken = null;
      return showLogin();
    }
    if(!res.ok) throw new Error("Lỗi khi lưu phiếu nhập");
    alert("Lưu thành công!");
    
    // Reset table
    document.getElementById("importTableBody").innerHTML = "";
    importRowCount = 0;
    addImportRow();
    
    // Tải lại danh sách kho
    loadVppItems();
    loadInventory();
    
  } catch(err) {
    alert(err.message);
  }
}

// --- Export Logic ---
// exportRowCount đã được khai báo ở đầu file
function addExportRow() {
  exportRowCount++;
  const tbody = document.getElementById("exportTableBody");
  if(!tbody) return;
  const tr = document.createElement("tr");
  tr.id = `exportRow_${exportRowCount}`;
  
  let optionsMaHtml = `<option value="">Chọn Mã</option>`;
  let optionsTenHtml = `<option value="">Chọn Tên</option>`;
  vppInventoryItems.forEach(invItem => {
    if(invItem.SoLuongTon > 0) {
      if(invItem.MaCap3) optionsMaHtml += `<option value="${invItem.MaCap3}">${invItem.MaCap3}</option>`;
      optionsTenHtml += `<option value="${invItem.TenVPP}">${invItem.TenVPP}</option>`;
    }
  });
  
  tr.innerHTML = `
    <td>${exportRowCount}</td>
    <td>
      <select class="form-control item-ma" style="width:100%">
        ${optionsMaHtml}
      </select>
      <input type="hidden" class="item-id">
      <input type="hidden" class="item-loai">
    </td>
    <td>
      <select class="form-control item-name" style="width:100%">
        ${optionsTenHtml}
      </select>
    </td>
    <td><input type="text" class="form-control item-dvt" readonly style="width:100%; background:#f0f0f0"></td>
    <td><input type="text" class="form-control item-ton" readonly style="width:100%; background:#f0f0f0"></td>
    <td><input type="number" class="form-control item-qty" value="1" min="1" style="width:100%"></td>
    <td><input type="text" class="form-control item-receiver" placeholder="Tên người/Phòng ban" style="width:100%"></td>
    <td><input type="text" class="form-control item-msnv" placeholder="Nhập MSNV" style="width:100%"></td>
    <td><input type="text" class="form-control item-bophan" placeholder="Nhập Bộ phận" style="width:100%"></td>
    <td><input type="text" class="form-control item-note" style="width:100%"></td>
    <td><button class="btn btn-danger btn-sm" onclick="removeExportRow(${exportRowCount})"><i class="fas fa-trash"></i></button></td>
  `;
  tbody.appendChild(tr);

  const maInput = tr.querySelector('.item-ma');
  const nameInput = tr.querySelector('.item-name');
  
  maInput.addEventListener('change', (e) => {
    const val = e.target.value.trim();
    const item = vppInventoryItems.find(x => x.MaCap3 === val);
    if(item) {
      tr.querySelector('.item-id').value = item.Id;
      tr.querySelector('.item-loai').value = item.Loai;
      tr.querySelector('.item-name').value = item.TenVPP;
      tr.querySelector('.item-dvt').value = item.DonViTinh;
      tr.querySelector('.item-ton').value = item.SoLuongTon;
      tr.querySelector('.item-qty').max = item.SoLuongTon;
    }
  });

  nameInput.addEventListener('change', (e) => {
    const val = e.target.value.trim();
    const item = vppInventoryItems.find(x => x.TenVPP === val);
    if(item) {
      tr.querySelector('.item-id').value = item.Id;
      tr.querySelector('.item-loai').value = item.Loai;
      tr.querySelector('.item-ma').value = item.MaCap3 || '';
      tr.querySelector('.item-dvt').value = item.DonViTinh;
      tr.querySelector('.item-ton').value = item.SoLuongTon;
      tr.querySelector('.item-qty').max = item.SoLuongTon;
    }
  });
}

function removeExportRow(id) {
  const row = document.getElementById(`exportRow_${id}`);
  if(row) row.remove();
}

async function saveExportData() {
  const rows = document.querySelectorAll('#exportTableBody tr');
  const items = [];
  
  for(let tr of rows) {
    const vppId = tr.querySelector('.item-id').value;
    if(!vppId) continue;
    
    const qty = parseFloat(tr.querySelector('.item-qty').value) || 0;
    const ton = parseFloat(tr.querySelector('.item-ton').value) || 0;
    
    if(qty > ton) {
      return alert(`Số lượng xuất không được lớn hơn tồn kho (Dòng ${tr.querySelector('td').textContent})`);
    }

    items.push({
      VppId: vppId,
      Loai: tr.querySelector('.item-loai') ? tr.querySelector('.item-loai').value : 'VPP',
      SoLuong: qty,
      NguoiNhan: tr.querySelector('.item-receiver').value,
      MSNV: tr.querySelector('.item-msnv').value,
      BoPhan: tr.querySelector('.item-bophan').value,
      GhiChu: tr.querySelector('.item-note').value
    });
  }

  if(items.length === 0) return alert("Vui lòng chọn ít nhất 1 vật tư hợp lệ để xuất");

  if(!confirm("Xác nhận lưu phiếu xuất này?")) return;

  try {
    const res = await fetch(`${API_BASE}/vpp/export`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${currentToken}` 
      },
      body: JSON.stringify({ items })
    });
    
    if (res.status === 401 || res.status === 403) {
      alert("Phiên đăng nhập hết hạn, vui lòng đăng nhập lại.");
      localStorage.removeItem("eam_token");
      currentToken = null;
      return showLogin();
    }
    
    if(!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Lỗi khi lưu phiếu xuất");
    }
    alert("Xuất kho thành công!");
    
    document.getElementById("exportTableBody").innerHTML = "";
    exportRowCount = 0;
    addExportRow();
    
    loadVppItems(); // Cập nhật lại tồn kho
    loadInventory();
  } catch(err) {
    alert(err.message);
  }
}

let vppHistoryItems = [];
let filteredHistoryItems = [];

async function loadHistoryData() {
  try {
    const res = await fetch(`${API_BASE}/vpp/history`, {
      headers: { "Authorization": `Bearer ${currentToken}` }
    });
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem("eam_token");
      currentToken = null;
      return showLogin();
    }
    if (!res.ok) throw new Error("Lỗi tải lịch sử");
    
    vppHistoryItems = await res.json();
    applyHistoryFilters();
  } catch(err) {
    console.error(err);
  }
}

function applyHistoryFilters() {
  const ma = (document.getElementById("filterHistoryMa")?.value || "").toLowerCase();
  const loai = document.getElementById("filterHistoryTrangThai")?.value || "";
  const donGiaQuery = (document.getElementById("filterHistoryDonGia")?.value || "").replace(/\./g, '').trim();

  filteredHistoryItems = vppHistoryItems.filter(item => {
    const matchMa = (item.MaCap3 || "").toLowerCase().includes(ma);
    const matchLoai = loai ? item.Loai === loai : true;
    
    let matchDonGia = true;
    if(donGiaQuery) {
      const g = item.DonGia || 0;
      const gVat = g * (1 + (item.VAT||0)/100);
      matchDonGia = g.toString().includes(donGiaQuery) || gVat.toString().includes(donGiaQuery);
    }
    return matchMa && matchLoai && matchDonGia;
  });
  renderHistoryTable();
}

function clearHistoryFilters() {
  if(document.getElementById("filterHistoryMa")) document.getElementById("filterHistoryMa").value = "";
  if(document.getElementById("filterHistoryTrangThai")) document.getElementById("filterHistoryTrangThai").value = "";
  if(document.getElementById("filterHistoryDonGia")) document.getElementById("filterHistoryDonGia").value = "";
  applyHistoryFilters();
}

function renderHistoryTable() {
  const tbody = document.getElementById("historyTableBody");
  if(!tbody) return;
  
  tbody.innerHTML = filteredHistoryItems.map(item => {
    const badge = item.Loai === 'NHAP' 
      ? '<span style="background: #2ecc71; color: #fff; padding: 2px 6px; border-radius: 4px; font-size:0.8rem">NHẬP</span>'
      : '<span style="background: #e67e22; color: #fff; padding: 2px 6px; border-radius: 4px; font-size:0.8rem">XUẤT</span>';
      
    const donGiaStr = item.DonGia != null ? Math.round(item.DonGia).toLocaleString('vi-VN') : '-';
    const donGiaVATStr = (item.DonGia != null && item.VAT != null) ? Math.round(item.DonGia * (1 + item.VAT/100)).toLocaleString('vi-VN') : '-';
    const thanhTienStr = item.ThanhTien != null ? Math.round(item.ThanhTien).toLocaleString('vi-VN') : '-';
    const nguoiNhap = item.NguoiThucHien || '';
    const nguoiNhan = item.NguoiNhan || '';
    const msnv = item.MSNV || '';
    const boPhan = item.BoPhan || '';

    return `
      <tr>
        <td>${formatMaDon(item.MaDon, item.MaCap3)}</td>
        <td>${badge}</td>
        <td>${item.TenVPP}</td>
        <td><strong>${item.SoLuong}</strong></td>
        <td>${donGiaStr}</td>
        <td>${donGiaVATStr}</td>
        <td style="color:#0056b3; font-weight:bold">${thanhTienStr}</td>
        <td>${nguoiNhap}</td>
        <td>${nguoiNhan}</td>
        <td>${msnv}</td>
        <td>${boPhan}</td>
        <td>${item.ThoiGian}</td>
      </tr>
    `;
  }).join("");
}


// =============================================
// DANH SÁCH ĐƠN NHẬP KHO
// =============================================
let importListData = [];

async function loadImportList() {
  try {
    const res = await fetch(`${API_BASE}/vpp/import-list`, {
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
  tbody.innerHTML = data.map((item, index) => {
    let statusHtml = item.PheDuyet === true 
      ? `<div style="border: 2px solid red; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border-radius: 3px; margin: 0 auto; background: white;"><i class="fas fa-check" style="color:red; font-size: 14px;"></i></div>`
      : `<div style="border: 2px solid red; width: 18px; height: 18px; display: inline-block; border-radius: 3px; margin: 0 auto; background: white;"></div>`;

    return `
      <tr class="import-list-row" style="cursor: pointer; text-align: center;">
        <td style="text-align:center"><input type="checkbox" class="import-cb" value="${item.Id}" data-status="${item.PheDuyet ? 1 : 0}" /></td>
        <td>${index + 1}</td>
        <td>${formatMaDon(item.MaDon, item.MaCap3)}</td>
        <td>${item.MaCap3 || ''}</td>
        <td>${item.TenVPP || ''}</td>
        <td><strong>${item.SoLuong || 0}</strong></td>
        <td>${item.DonGia != null ? Math.round(item.DonGia).toLocaleString('vi-VN') : '-'}</td>
        <td>${(item.DonGia != null && item.VAT != null) ? Math.round(item.DonGia * (1 + item.VAT/100)).toLocaleString('vi-VN') : '-'}</td>
        <td style="color:#0056b3; font-weight:bold">${item.ThanhTien != null ? Math.round(item.ThanhTien).toLocaleString('vi-VN') : '-'}</td>
        <td>${item.NguoiNhap || ''}</td>
        <td>${formatDateFull(item.NgayNhap)}</td>
        <td style="text-align:center">${statusHtml}</td>
      </tr>
    `;
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

  const trLoaiVatTu = e.target.closest(".loaiVatTu-list-row");
  if (trLoaiVatTu && !e.target.closest("input") && !e.target.closest("button")) {
    const cb = trLoaiVatTu.querySelector(".loaiVatTu-cb");
    if(cb) {
      cb.checked = !cb.checked;
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
const btnImpAppr = document.getElementById("btnImportListApprove"); if(btnImpAppr) btnImpAppr.addEventListener("click", async () => {
  const ids = Array.from(document.querySelectorAll(".import-cb:checked")).map(cb => cb.value);
  if(!ids.length) return;
  try {
    await fetch(`${API_BASE}/vpp/import/approve`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentToken },
      body: JSON.stringify({ ids, status: 1 })
    });
    showAlert("Đã xác nhận thành công!", true);
    loadImportList();
    loadInventory();
  } catch(e) { console.error(e); }
});

const btnImpUnl = document.getElementById("btnImportListUnlock"); if(btnImpUnl) btnImpUnl.addEventListener("click", async () => {
  const ids = Array.from(document.querySelectorAll(".import-cb:checked")).map(cb => cb.value);
  if(!ids.length) return;
  try {
    await fetch(`${API_BASE}/vpp/import/approve`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentToken },
      body: JSON.stringify({ ids, status: 0 })
    });
    showAlert("Đã mở khóa thành công!", true);
    loadImportList();
    loadInventory();
  } catch(e) { console.error(e); }
});

const btnImpDel = document.getElementById("btnImportListDelete"); if(btnImpDel) btnImpDel.addEventListener("click", async () => {
  const ids = Array.from(document.querySelectorAll(".import-cb:checked")).map(cb => cb.value);
  if(!ids.length) return;
  if(!confirm("Bạn có chắc chắn muốn xóa " + ids.length + " dòng nhập kho này? Tồn kho sẽ bị trừ lại.")) return;
  
  try {
    for (let id of ids) {
      const res = await fetch(`${API_BASE}/vpp/import/${id}`, {
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
const btnImpEdit = document.getElementById("btnImportListEdit"); if(btnImpEdit) btnImpEdit.addEventListener("click", () => {
  const cb = document.querySelector(".import-cb:checked");
  if(!cb) return;
  const id = cb.value;
  const item = importListData.find(d => d.Id == id);
  if(!item) return;
  
  currentEditImportId = id;
  document.getElementById("editImportSoLuong").value = item.SoLuong || 0;
  document.getElementById("editImportDonGia").value = item.DonGia || 0;
  document.getElementById("editImportVAT").value = item.VAT || 0;
  
  document.getElementById("editImportModal").style.display = "flex";
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
    const res = await fetch(`${API_BASE}/vpp/import/${currentEditImportId}`, {
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
    const res = await fetch(`${API_BASE}/vpp/export-list`, {
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
  tbody.innerHTML = data.map((item, index) => {
    let statusHtml = item.PheDuyet === true 
      ? `<div style="border: 2px solid red; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border-radius: 3px; margin: 0 auto; background: white;"><i class="fas fa-check" style="color:red; font-size: 14px;"></i></div>`
      : `<div style="border: 2px solid red; width: 18px; height: 18px; display: inline-block; border-radius: 3px; margin: 0 auto; background: white;"></div>`;

    return `
      <tr class="export-list-row" style="cursor: pointer; text-align: center;">
        <td style="text-align:center"><input type="checkbox" class="export-cb" value="${item.Id}" data-status="${item.PheDuyet ? 1 : 0}" /></td>
        <td>${index + 1}</td>
        <td>${formatMaDon(item.MaDon, item.MaCap3)}</td>
        <td>${item.MaCap3 || ''}</td>
        <td>${item.TenVPP || ''}</td>
        <td><strong>${item.SoLuong || 0}</strong></td>
        <td>${item.DonGiaTon != null ? Math.round(item.DonGiaTon).toLocaleString('vi-VN') : '-'}</td>
        <td style="color:#0056b3; font-weight:bold">${item.ThanhTien != null ? Math.round(item.ThanhTien).toLocaleString('vi-VN') : '-'}</td>
        <td>${item.NguoiNhan || ''}</td>
        <td>${item.MSNV || ''}</td>
        <td>${item.BoPhan || ''}</td>
        <td>${formatDateFull(item.NgayXuat)}</td>
        <td style="text-align:center">${statusHtml}</td>
      </tr>
    `;
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
const btnExpAppr = document.getElementById("btnExportListApprove"); if(btnExpAppr) btnExpAppr.addEventListener("click", async () => {
  const ids = Array.from(document.querySelectorAll(".export-cb:checked")).map(cb => cb.value);
  if(!ids.length) return;
  try {
    await fetch(`${API_BASE}/vpp/export/approve`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentToken },
      body: JSON.stringify({ ids, status: 1 })
    });
    showAlert("Đã xác nhận thành công!", true);
    loadExportList();
    loadInventory();
  } catch(e) { console.error(e); }
});

const btnExpUnl = document.getElementById("btnExportListUnlock"); if(btnExpUnl) btnExpUnl.addEventListener("click", async () => {
  const ids = Array.from(document.querySelectorAll(".export-cb:checked")).map(cb => cb.value);
  if(!ids.length) return;
  try {
    await fetch(`${API_BASE}/vpp/export/approve`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentToken },
      body: JSON.stringify({ ids, status: 0 })
    });
    showAlert("Đã mở khóa thành công!", true);
    loadExportList();
    loadInventory();
  } catch(e) { console.error(e); }
});

const btnExpDel = document.getElementById("btnExportListDelete"); if(btnExpDel) btnExpDel.addEventListener("click", async () => {
  const ids = Array.from(document.querySelectorAll(".export-cb:checked")).map(cb => cb.value);
  if(!ids.length) return;
  if(!confirm("Bạn có chắc chắn muốn xóa " + ids.length + " dòng xuất kho này? Hàng sẽ được trả lại kho.")) return;
  
  try {
    for (let id of ids) {
      const res = await fetch(`${API_BASE}/vpp/export/${id}`, {
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
const btnExpEdit = document.getElementById("btnExportListEdit"); if(btnExpEdit) btnExpEdit.addEventListener("click", () => {
  const cb = document.querySelector(".export-cb:checked");
  if(!cb) return;
  const id = cb.value;
  const item = exportListData.find(d => d.Id == id);
  if(!item) return;
  
  currentEditExportId = id;
  document.getElementById("editExportSoLuong").value = item.SoLuong || 0;
  
  document.getElementById("editExportModal").style.display = "flex";
});
document.getElementById("closeEditExportModal").addEventListener("click", () => document.getElementById("editExportModal").style.display="none");
document.getElementById("btnCancelEditExport").addEventListener("click", () => document.getElementById("editExportModal").style.display="none");

document.getElementById("btnSaveEditExport").addEventListener("click", async () => {
  if(!currentEditExportId) return;
  const data = {
    SoLuong: parseFloat(document.getElementById("editExportSoLuong").value)
  };
  try {
    const res = await fetch(`${API_BASE}/vpp/export/${currentEditExportId}`, {
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


function formatDateFull(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${h}:${m}:${s}`;
}


function formatMaDon(maDon, maCap3) {
  if (!maDon || !maCap3) return maDon || '';
  let parts = maDon.split('-');
  if (parts.length > 1) {
    let suffix = maCap3;
    if (suffix.toUpperCase().startsWith('F')) {
       suffix = suffix.substring(1);
    }
    return parts[0] + '-' + suffix;
  }
  return maDon;
}


/* ==================================================
   QUẢN LÝ LOẠI VẬT TƯ (DANH MỤC CẤP 2 - SANPHAM)
   ================================================== */
let loaiVatTuItems = [];
let danhMucCap1List = [];

// 1. Fetch dữ liệu
async function fetchLoaiVatTu() {
  try {
    const res = await fetch('/api/vpp/danhmuc/cap2', {
      headers: { "Authorization": `Bearer ${currentToken}` }
    });
    if(res.ok) {
      loaiVatTuItems = await res.json();
      renderLoaiVatTuTable();
    }
  } catch(e) {
    console.error("Lỗi fetchLoaiVatTu", e);
  }
}

async function fetchCap1() {
  try {
    const res = await fetch('/api/vpp/danhmuc/cap1', {
      headers: { "Authorization": `Bearer ${currentToken}` }
    });
    if(res.ok) {
      danhMucCap1List = await res.json();
    }
  } catch(e) {
    console.error("Lỗi fetchCap1", e);
  }
}

// 2. Render Table
function renderLoaiVatTuTable() {
  const tbody = document.getElementById("loaiVatTuTableBody");
  if(!tbody) return;
  tbody.innerHTML = loaiVatTuItems.map((item, idx) => {
    return `
      <tr class="loaiVatTu-list-row" style="cursor: pointer; text-align: center;">
        <td style="text-align:center"><input type="checkbox" class="loaiVatTu-cb" value="${item.Id}"></td>
        <td>${idx + 1}</td>
        <td>${item.TenCap1 || ''}</td>
        <td>${item.MaCap2} - ${item.TenCap2}</td>
      </tr>
    `;
  }).join("");
}

function toggleAllLoaiVatTu(source) {
  document.querySelectorAll(".loaiVatTu-cb").forEach(cb => cb.checked = source.checked);
}

async function deleteSelectedLoaiVatTu() {
  const ids = Array.from(document.querySelectorAll(".loaiVatTu-cb:checked")).map(cb => cb.value);
  if(ids.length === 0) {
    showAlert("Vui lòng chọn ít nhất 1 dòng để xóa", false);
    return;
  }
  if(!confirm(`Bạn có chắc chắn muốn xóa ${ids.length} loại vật tư đã chọn?`)) return;
  
  try {
    let successCount = 0;
    for(let id of ids) {
      const res = await fetch('/api/vpp/danhmuc/cap2/' + id, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${currentToken}` }
      });
      if(res.ok) successCount++;
    }
    showAlert(`Đã xóa thành công ${successCount} dòng`, true);
    await fetchLoaiVatTu();
  } catch(e) {
    console.error(e);
    showAlert("Lỗi khi xóa nhiều loại vật tư", false);
  }
}

// 3. Modal Thêm Mới
async function openAddLoaiVatTuModal() {
  if (danhMucCap1List.length === 0) await fetchCap1();
  const select = document.getElementById("loaiVatTuCap1");
  select.innerHTML = '<option value="">-- Chọn Loại Vật Tư --</option>' + 
    danhMucCap1List.map(c => `<option value="${c.Id}">${c.TenCap1}</option>`).join("");
  
  document.getElementById("loaiVatTuMaCap2").value = "";
  document.getElementById("loaiVatTuTenCap2").value = "";
  document.getElementById("addLoaiVatTuModal").style.display = "flex";
}

function closeAddLoaiVatTuModal() {
  document.getElementById("addLoaiVatTuModal").style.display = "none";
}

async function saveAddLoaiVatTu() {
  const loaiVatTuId = document.getElementById("loaiVatTuCap1").value;
  const maCap2 = document.getElementById("loaiVatTuMaCap2").value.trim();
  const tenCap2 = document.getElementById("loaiVatTuTenCap2").value.trim();
  
  if(!loaiVatTuId || !maCap2 || !tenCap2) {
    showAlert("Vui lòng nhập đầy đủ thông tin", false);
    return;
  }
  
  try {
    const res = await fetch('/api/vpp/danhmuc/cap2', {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${currentToken}`
      },
      body: JSON.stringify({ maCap2, tenCap2, loaiVatTuId })
    });
    if(res.ok) {
      showAlert("Thêm mới thành công", true);
      closeAddLoaiVatTuModal();
      await fetchLoaiVatTu();
      // Reload danh mục để update dropdown
      await loadCap2Dropdown();
    } else {
      const err = await res.text();
      showAlert(err, false);
    }
  } catch(e) {
    console.error(e);
    showAlert("Lỗi thêm loại vật tư", false);
  }
}

async function deleteLoaiVatTu(id) {
  if(!confirm("Bạn có chắc chắn muốn xóa Loại Vật Tư này?")) return;
  try {
    const res = await fetch('/api/vpp/danhmuc/cap2/' + id, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${currentToken}` }
    });
    if(res.ok) {
      showAlert("Xóa thành công", true);
      await fetchLoaiVatTu();
      await loadCap2Dropdown();
    } else {
      showAlert("Lỗi khi xóa", false);
    }
  } catch(e) {
    showAlert("Lỗi kết nối", false);
  }
}
