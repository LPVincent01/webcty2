const fs = require('fs');
const jsPath = 'c:/PC/Laptrinhweb/webcty2/frontend/vpp/vpp.js';
let content = fs.readFileSync(jsPath, 'utf8');

const newCode = `

/* ==================================================
   QUẢN LÝ LOẠI VẬT TƯ (DANH MỤC CẤP 2 - SANPHAM)
   ================================================== */
let loaiVatTuItems = [];
let danhMucCap1List = [];

// 1. Fetch dữ liệu
async function fetchLoaiVatTu() {
  try {
    const res = await fetch('/api/vpp/danhmuc/cap2', {
      headers: { "Authorization": \`Bearer \${currentToken}\` }
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
      headers: { "Authorization": \`Bearer \${currentToken}\` }
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
    return \`
      <tr>
        <td>\${idx + 1}</td>
        <td>\${item.TenCap1 || ''}</td>
        <td>\${item.MaCap2} - \${item.TenCap2}</td>
        <td>
          <button class="btn-icon" style="color: #c0392b;" onclick="deleteLoaiVatTu(\${item.Id})" title="Xóa">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    \`;
  }).join("");
}

// 3. Modal Thêm Mới
async function openAddLoaiVatTuModal() {
  if (danhMucCap1List.length === 0) await fetchCap1();
  const select = document.getElementById("loaiVatTuCap1");
  select.innerHTML = '<option value="">-- Chọn Loại Vật Tư --</option>' + 
    danhMucCap1List.map(c => \`<option value="\${c.Id}">\${c.TenCap1}</option>\`).join("");
  
  document.getElementById("loaiVatTuMaCap2").value = "";
  document.getElementById("loaiVatTuTenCap2").value = "";
  document.getElementById("addLoaiVatTuModal").style.display = "block";
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
        "Authorization": \`Bearer \${currentToken}\`
      },
      body: JSON.stringify({ maCap2, tenCap2, loaiVatTuId })
    });
    if(res.ok) {
      showAlert("Thêm mới thành công", true);
      closeAddLoaiVatTuModal();
      await fetchLoaiVatTu();
      // Reload danh mục để update dropdown nếu cần
      if(window.fetchDanhMucCap2) await window.fetchDanhMucCap2();
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
      headers: { "Authorization": \`Bearer \${currentToken}\` }
    });
    if(res.ok) {
      showAlert("Xóa thành công", true);
      await fetchLoaiVatTu();
    } else {
      showAlert("Lỗi khi xóa", false);
    }
  } catch(e) {
    showAlert("Lỗi kết nối", false);
  }
}
`;

if (!content.includes('fetchLoaiVatTu')) {
  fs.writeFileSync(jsPath, content + newCode, 'utf8');
  console.log("Appended JS code");
}
