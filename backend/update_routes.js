const fs = require('fs');
let code = fs.readFileSync('backend/routes/vppRoutes.js', 'utf8');
code = code.replace(/JOIN dbo\.VANPHONGPHAM v ON t\.VppId = v\.Id/g, "JOIN dbo.V_VATTU v ON t.VppId = v.Id AND t.Loai = v.Loai");
code = code.replace(/JOIN dbo\.VANPHONGPHAM v ON n\.VppId = v\.Id/g, "JOIN dbo.V_VATTU v ON n.VppId = v.Id AND n.Loai = v.Loai");
code = code.replace(/JOIN dbo\.VANPHONGPHAM v ON x\.VppId = v\.Id/g, "JOIN dbo.V_VATTU v ON x.VppId = v.Id AND x.Loai = v.Loai");
fs.writeFileSync('backend/routes/vppRoutes.js', code, 'utf8');
console.log('Replaced VANPHONGPHAM joins with V_VATTU joins');
