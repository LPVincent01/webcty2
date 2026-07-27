const API_BASE = "/api";
let currentToken = localStorage.getItem("eam_token");
let currentUser = localStorage.getItem("eam_user");
let currentDisplayName = localStorage.getItem("eam_displayName");
let vppItems = []; // Danh sách VPP lưu cache

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
  document.querySelectorAll(".sidebar-menu a").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".sidebar-menu a").forEach(a => a.classList.remove("active"));
      link.classList.add("active");
      
      document.querySelectorAll(".content-section").forEach(sec => sec.style.display = "none");
      const targetId = `vpp-${link.dataset.section}Section`;
      const targetSec = document.getElementById(targetId);
      if(targetSec) targetSec.style.display = "block";
    });
  });

  // Import table events
  document.getElementById("addImportRowBtn").addEventListener("click", addImportRow);
  document.getElementById("saveImportBtn").addEventListener("click", saveImportData);
  if(document.getElementById("refreshVppBtn")) {
    document.getElementById("refreshVppBtn").addEventListener("click", async () => {
      await loadVppItems();
      await loadHistoryData();
      showAlert("Dữ liệu đã được cập nhật", true);
    });
  }

  // Add VPP Modal
  const addModal = document.getElementById("addVppModal");
  document.getElementById("addVppBtn").addEventListener("click", () => {
    addModal.style.display = "block";
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
  
  // History events
  document.getElementById("refreshHistoryBtn").addEventListener("click", loadHistoryData);

  // Toggle password visibility
  const togglePassword = document.getElementById("togglePassword");
  const passwordInput = document.getElementById("password");
  if (togglePassword && passwordInput) {
    togglePassword.addEventListener("click", function () {
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
    if (!select) return;
    select.innerHTML = `<option value="">-- Chọn nhóm (mã tự sinh) --</option>`;
    cap2List.forEach(item => {
      select.innerHTML += `<option value="${item.MaCap2}">${item.MaCap2} - ${item.TenCap2}</option>`;
    });
  } catch (err) {
    console.error("Lỗi tải danh mục cấp 2:", err);
  }
}

// --- Fetch Data ---
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
    renderVppTable();
    refreshAllDropdowns();
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
    nameSel.innerHTML = optionsTenHtml; nameSel.value = valName;
    
    // Update DVT if an item is selected
    const selectedItem = vppItems.find(x => x.MaCap3 === valMa || x.TenVPP === valName);
    if (selectedItem) {
      tr.querySelector('.item-dvt').value = selectedItem.DonViTinh || '';
    }
  });

  let optionsMaHtmlExport = `<option value="">Chọn Mã</option>`;
  let optionsTenHtmlExport = `<option value="">Chọn Tên</option>`;
  vppItems.forEach(item => {
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
    const selectedItem = vppItems.find(x => x.MaCap3 === valMa || x.TenVPP === valName);
    if (selectedItem) {
      tr.querySelector('.item-dvt').value = selectedItem.DonViTinh || '';
      tr.querySelector('.item-ton').value = selectedItem.SoLuongTon || 0;
      tr.querySelector('.item-qty').max = selectedItem.SoLuongTon || 0;
    }
  });
}

let currentVppPage = 1;
const VPP_PER_PAGE = 10;

function renderVppTable() {
  const tbody = document.getElementById("vppTableBody");
  const pagination = document.getElementById("vppPagination");
  if(!tbody) return;

  const totalPages = Math.ceil(vppItems.length / VPP_PER_PAGE);
  if (currentVppPage > totalPages && totalPages > 0) currentVppPage = totalPages;

  const startIndex = (currentVppPage - 1) * VPP_PER_PAGE;
  const currentItems = vppItems.slice(startIndex, startIndex + VPP_PER_PAGE);

  tbody.innerHTML = currentItems.map((item, index) => {
    const donGia = item.DonGia || 0;
    const vat = item.VAT || 0;
    const donGiaVAT = donGia * (1 + vat / 100);
    const thanhTien = (item.SoLuongTon || 0) * donGiaVAT;

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
      <td>${item.GhiChu || ''}</td>
      <td style="display: flex; gap: 5px;">
        <button class="btn btn-warning btn-sm" onclick="openEditVppModal(${item.Id})" style="margin-right: 5px;" title="Chỉnh sửa"><i class="fas fa-pen"></i></button>
        <button class="btn btn-danger btn-sm" onclick="deleteVpp(${item.Id})">Xóa</button>
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
function openEditVppModal(id) {
  const item = vppItems.find(i => i.Id == id);
  if(!item) return;

  document.getElementById('editVppId').value = item.Id;
  document.getElementById('editVppName').value = item.TenVPP || "";
  document.getElementById('editVppUnit').value = item.DonViTinh || "";
  document.getElementById('editVppBrand').value = item.ThuongHieu || "";
  document.getElementById('editVppSupplier').value = item.NhaCungCap || "";
  document.getElementById('editVppNote').value = item.GhiChu || "";
  
  const priceInput = document.getElementById('editVppPrice');
  const vatInput = document.getElementById('editVppVat');
  
  priceInput.value = item.DonGia || 0;
  vatInput.value = item.VAT || 0;

  // Logic: Only allow editing price/VAT if it has been imported (HasImport == true)
  if (item.HasImport) {
    priceInput.readOnly = false;
    priceInput.style.background = '#fff';
    vatInput.readOnly = false;
    vatInput.style.background = '#fff';
  } else {
    priceInput.readOnly = true;
    priceInput.style.background = '#e9ecef';
    vatInput.readOnly = true;
    vatInput.style.background = '#e9ecef';
  }
  
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

  calculateEditPriceVat();
  document.getElementById('editVppModal').style.display = 'block';
}

function calculateEditPriceVat() {
  const price = parseFloat(document.getElementById('editVppPrice').value) || 0;
  const vat = parseFloat(document.getElementById('editVppVat').value) || 0;
  document.getElementById('editVppPriceVat').value = price * (1 + vat / 100);
}

document.getElementById('editVppPrice').addEventListener('input', calculateEditPriceVat);
document.getElementById('editVppVat').addEventListener('input', calculateEditPriceVat);

document.getElementById('closeEditVppModal').addEventListener('click', () => {
  document.getElementById('editVppModal').style.display = 'none';
});
document.getElementById('cancelEditVppBtn').addEventListener('click', () => {
  document.getElementById('editVppModal').style.display = 'none';
});

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
    DonGia: parseFloat(document.getElementById('editVppPrice').value) || 0,
    VAT: parseFloat(document.getElementById('editVppVat').value) || 0,
    HinhAnh: document.getElementById('editVppImageBase64').value || ""
  };

  try {
    const res = await fetch(`${API_BASE}/vpp/items/${id}`, {
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
      await loadVppItems();
    } else {
      showAlert("Lỗi khi cập nhật VPP", false);
    }
  } catch(err) {
    console.error(err);
  }
});

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

    loadVppItems();
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
let importRowCount = 0;
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
    
  } catch(err) {
    alert(err.message);
  }
}

// --- Export Logic ---
let exportRowCount = 0;
function addExportRow() {
  exportRowCount++;
  const tbody = document.getElementById("exportTableBody");
  if(!tbody) return;
  const tr = document.createElement("tr");
  tr.id = `exportRow_${exportRowCount}`;
  
  let optionsMaHtml = `<option value="">Chọn Mã</option>`;
  let optionsTenHtml = `<option value="">Chọn Tên</option>`;
  vppItems.forEach(item => {
    if(item.SoLuongTon > 0) {
      if(item.MaCap3) optionsMaHtml += `<option value="${item.MaCap3}">${item.MaCap3}</option>`;
      optionsTenHtml += `<option value="${item.TenVPP}">${item.TenVPP}</option>`;
    }
  });
  
  tr.innerHTML = `
    <td>${exportRowCount}</td>
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
    <td><input type="text" class="form-control item-dvt" readonly style="width:100%; background:#f0f0f0"></td>
    <td><input type="text" class="form-control item-ton" readonly style="width:100%; background:#f0f0f0"></td>
    <td><input type="number" class="form-control item-qty" value="1" min="1" style="width:100%"></td>
    <td><input type="text" class="form-control item-receiver" placeholder="Tên người/Phòng ban" style="width:100%"></td>
    <td><input type="text" class="form-control item-note" style="width:100%"></td>
    <td><button class="btn btn-danger btn-sm" onclick="removeExportRow(${exportRowCount})"><i class="fas fa-trash"></i></button></td>
  `;
  tbody.appendChild(tr);

  const maInput = tr.querySelector('.item-ma');
  const nameInput = tr.querySelector('.item-name');
  
  maInput.addEventListener('change', (e) => {
    const val = e.target.value.trim();
    const item = vppItems.find(x => x.MaCap3 === val);
    if(item) {
      tr.querySelector('.item-id').value = item.Id;
      tr.querySelector('.item-name').value = item.TenVPP;
      tr.querySelector('.item-dvt').value = item.DonViTinh;
      tr.querySelector('.item-ton').value = item.SoLuongTon;
      tr.querySelector('.item-qty').max = item.SoLuongTon;
    }
  });

  nameInput.addEventListener('change', (e) => {
    const val = e.target.value.trim();
    const item = vppItems.find(x => x.TenVPP === val);
    if(item) {
      tr.querySelector('.item-id').value = item.Id;
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
      SoLuong: qty,
      NguoiNhan: tr.querySelector('.item-receiver').value,
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
  } catch(err) {
    alert(err.message);
  }
}

// --- History Logic ---
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
    
    const data = await res.json();
    const tbody = document.getElementById("historyTableBody");
    if(!tbody) return;
    
    tbody.innerHTML = data.map(item => {
      const badge = item.Loai === 'NHAP' 
        ? '<span style="background: #2ecc71; color: #fff; padding: 2px 6px; border-radius: 4px; font-size:0.8rem">NHẬP</span>'
        : '<span style="background: #e67e22; color: #fff; padding: 2px 6px; border-radius: 4px; font-size:0.8rem">XUẤT</span>';
        
      const donGiaStr = item.DonGia != null ? item.DonGia.toLocaleString('vi-VN') : '-';
      const donGiaVATStr = item.DonGia != null ? (item.DonGia * (1 + item.VAT/100)).toLocaleString('vi-VN') : '-';
      const thanhTienStr = item.ThanhTien != null ? item.ThanhTien.toLocaleString('vi-VN') : '-';
      const nguoiNhap = item.NguoiThucHien || item.NguoiNhan || '';

      return `
        <tr>
          <td>${item.MaCap3 || ''}</td>
          <td>${badge}</td>
          <td>${item.TenVPP}</td>
          <td><strong>${item.SoLuong}</strong></td>
          <td>${donGiaStr}</td>
          <td>${donGiaVATStr}</td>
          <td style="color:#0056b3; font-weight:bold">${thanhTienStr}</td>
          <td>${nguoiNhap}</td>
          <td>${item.ThoiGian}</td>
        </tr>
      `;
    }).join("");
  } catch(err) {
    console.error(err);
  }
}
