# tests/fixtures/xlsx/luu-lai-bang-excel.ps1 — tạo lại các file excel365-*.xlsx bằng Excel thật (COM, cần cài Excel)
# Chạy: powershell -ExecutionPolicy Bypass -File tests\fixtures\xlsx\luu-lai-bang-excel.ps1
#  1. node tests\xlsx.test.cjs  → dựng lại mau-day-du.xlsx, tien-to-x-2-tang.xlsx
#  2. Excel mở rồi lưu lại → excel365-mau-day-du.xlsx, excel365-wps-luu-lai.xlsx
#  3. Excel tự tạo bảng tính (rich text, Alt+Enter, ô gộp, ảnh nổi) → excel365-tu-tao.xlsx
#  4. Xoá tên người dùng / đường dẫn máy (docProps, x15ac:absPath)
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$goc = (Resolve-Path (Join-Path $dir '..\..\..')).Path
& node (Join-Path $goc 'tests\xlsx.test.cjs') | Out-Null
$tam = Join-Path $env:TEMP ('nh-xlsx-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $tam | Out-Null
& node -e "const t=require(process.argv[1]);const fs=require('fs');fs.writeFileSync(process.argv[2],t.taoPng(40,30,[200,30,30]))" (Join-Path $dir 'tao-xlsx.cjs') (Join-Path $tam 'anh.png')

$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false
try {
  foreach ($p in @(@('mau-day-du.xlsx', 'excel365-mau-day-du.xlsx'), @('tien-to-x-2-tang.xlsx', 'excel365-wps-luu-lai.xlsx'))) {
    $wb = $xl.Workbooks.Open((Join-Path $dir $p[0]), 0, $true)
    $wb.RemovePersonalInformation = $true
    $wb.SaveAs((Join-Path $dir $p[1]), 51)
    $wb.Close($false)
  }
  $wb = $xl.Workbooks.Add()
  $wb.RemovePersonalInformation = $true
  $ws = $wb.Worksheets.Item(1)
  $ws.Name = 'Câu hỏi'
  $ws.Range('A1').Value2 = 'ĐỀ KIỂM TRA'
  $ws.Range('A1:H1').Merge()
  $h = @('STT', 'Loại câu', 'Nội dung câu hỏi', 'Ảnh', 'A', 'B', 'C', 'D', 'Đáp án', 'Điểm', 'Lời giải', 'Ngân hàng')
  for ($i = 0; $i -lt $h.Count; $i++) { $ws.Cells.Item(2, $i + 1).Value2 = $h[$i] }
  $ws.Range('A3').Value2 = 1; $ws.Range('B3').Value2 = 'TN – Một đáp án'
  $ws.Range('C3').Value2 = 'Giá trị của x2 là' + [char]10 + 'bao nhiêu?'
  $ws.Range('C3').Characters(13, 1).Font.Italic = $true
  $ws.Range('C3').Characters(14, 1).Font.Superscript = $true
  $ws.Range('C3').Characters(19, 4).Font.Bold = $true
  $ws.Range('E3').Value2 = 0.25; $ws.Range('F3').Value2 = '0,5'; $ws.Range('G3').Formula = '=1/3'; $ws.Range('H3').Value2 = $true
  $ws.Range('I3').Value2 = 'A'; $ws.Range('J3').Value2 = 0.5; $ws.Range('L3').Value2 = 'Toán 11'
  $ws.Range('A4').Value2 = 2; $ws.Range('B4').Value2 = 'ĐS – Đúng/Sai'; $ws.Range('B4:B5').Merge()
  $ws.Range('C4').Value2 = 'Xét:'; $ws.Range('E4').Value2 = 'p'; $ws.Range('F4').Value2 = 'q'; $ws.Range('I4').Value2 = 'ĐS'
  $ws.Range('A5').Value2 = 3; $ws.Range('C5').Value2 = 'Xét tiếp:'; $ws.Range('E5').Value2 = 'r'; $ws.Range('F5').Value2 = 's'; $ws.Range('I5').Value2 = 'a-S, b-Đ'
  $ws.Range('A6').Value2 = 4; $ws.Range('B6').Value2 = 'TL'; $ws.Range('C6').Value2 = 'Mô tả hình.'
  $c = $ws.Range('D6')
  $ws.Shapes.AddPicture((Join-Path $tam 'anh.png'), 0, -1, $c.Left + 2, $c.Top + 2, 30, 22.5) | Out-Null
  $ws.Range('A7').Value2 = 5; $ws.Range('B7').Value2 = 'TN'; $ws.Range('C7').Value2 = 'Ảnh trong ô'; $ws.Range('E7').Value2 = 'x'; $ws.Range('F7').Value2 = 'y'; $ws.Range('I7').Value2 = 'B'
  $wb.SaveAs((Join-Path $dir 'excel365-tu-tao.xlsx'), 51)
  $wb.Close($false)
} finally {
  $xl.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
  Remove-Item -Recurse -Force $tam -Confirm:$false
}

# xoá dấu vết máy: tên người (docProps/core.xml) và đường dẫn tuyệt đối (x15ac:absPath)
$js = @'
const zip = require(process.argv[1]); const fs = require('fs');
(async () => {
  for (const p of process.argv.slice(2)) {
    const z = await zip.readZip(fs.readFileSync(p));
    const files = Object.keys(z).map(k => {
      let d = z[k];
      if (k === 'docProps/core.xml' || k === 'xl/workbook.xml') {
        d = Buffer.from(d).toString()
          .replace(/<dc:creator>[^<]*<\/dc:creator>/, '<dc:creator></dc:creator>')
          .replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy></cp:lastModifiedBy>')
          .replace(/<mc:AlternateContent[^>]*><mc:Choice Requires="x15"><x15ac:absPath [^>]*\/><\/mc:Choice><\/mc:AlternateContent>/, '');
      }
      return { path: k, data: d };
    });
    fs.writeFileSync(p, await zip.writeZip(files, { date: new Date(2026, 0, 1) }));
  }
})();
'@
& node -e $js (Join-Path $goc 'js\zip.js') (Join-Path $dir 'excel365-mau-day-du.xlsx') (Join-Path $dir 'excel365-wps-luu-lai.xlsx') (Join-Path $dir 'excel365-tu-tao.xlsx')
Write-Output 'Đã tạo lại excel365-*.xlsx'
