const fs = require('fs');
let content = fs.readFileSync('c:/PC/Laptrinhweb/webcty2/frontend/vpp/vpp.js', 'utf8');
const oldCode = `  const trExport = e.target.closest(".export-list-row");
  if (trExport && !e.target.closest("input") && !e.target.closest("button")) {
    const cb = trExport.querySelector(".export-cb");
    if(cb) {
      cb.checked = !cb.checked;
      updateExportToolbar();
    }
  }
});`;

const newCode = `  const trExport = e.target.closest(".export-list-row");
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
});`;

if(content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync('c:/PC/Laptrinhweb/webcty2/frontend/vpp/vpp.js', content);
  console.log('Replaced successfully');
} else {
  console.log('Code not found');
}
