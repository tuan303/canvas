# tests/fixtures/xlsx/dien-mau-bang-office.ps1 — "giáo viên thật" điền mẫu bằng Excel / Word (COM) → fixture do Office ghi
# Chạy: powershell -ExecutionPolicy Bypass -File tests\fixtures\xlsx\dien-mau-bang-office.ps1 [excel|word]   (cần cài Office)
#  1. office-giao-vien.xlsx : mở mau\Mau-ngan-hang-cau-hoi.xlsx, xoá dòng ví dụ, gõ đủ 10 loại câu (Alt+Enter, chữ đậm/nghiêng một phần,
#     0,25 gõ theo kiểu số Việt Nam, công thức STT kéo xuống = công thức dùng chung, điểm =1/2, ô gộp, ghi chú ô, lọc), dán ảnh nổi có
#     văn bản thay thế, ảnh "Đặt trong ô" (InsertPictureInCell) ở cột phương án
#  2. office-tu-lam.xlsx    : bảng tính giáo viên tự lập (không theo mẫu): 1/2 và 8/3 bị Excel đổi thành ngày tháng, 25 %, định dạng 0.00,
#     phân số # ?/?, ngày dd/mm/yyyy, hộp văn bản nổi, Format as Table, danh sách thả xuống lấy từ trang khác (x14)
#  3. ..\docx\office-giao-vien.docx : mở mau\Mau-ngan-hang-cau-hoi.docx, thêm một ngân hàng bằng Word: công thức gõ dạng tuyến tính rồi
#     OMaths.BuildUp, ảnh InlineShapes.AddPicture có Alt Text, gạch chân nhãn đáp án, phương án Word tự đánh số, bảng 2×2, công thức khối
#  4. Xoá dấu vết máy (tên người, đường dẫn) bằng Node.
# Chỉ đóng/thoát đúng Excel/Word do script tạo ra (Quit trong finally); không đụng Office người dùng đang mở.
# Biến môi trường NH_PIDFILE (tuỳ chọn): ghi PID Office đã tạo để công cụ canh giờ ngoài dừng đúng tiến trình nếu bị treo.
$ErrorActionPreference = 'Stop'
$chi = if ($args.Count) { $args[0] } else { 'tat-ca' }
$dir = $PSScriptRoot
$goc = (Resolve-Path (Join-Path $dir '..\..\..')).Path
$dirDocx = Join-Path $goc 'tests\fixtures\docx'
$tam = Join-Path $env:TEMP ('nh-office-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $tam | Out-Null
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class NhW32 { [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid); }
"@
function GhiPid($ten, $p) { if ($env:NH_PIDFILE) { Add-Content -Path $env:NH_PIDFILE -Value ($ten + ' ' + $p) } }
function Buoc($t) { $d0 = (Get-Date -Format 'HH:mm:ss') + ' ' + $t; Write-Host $d0; if ($env:NH_LOG) { Add-Content -Path $env:NH_LOG -Value $d0 -Encoding UTF8 } }
function Nha($o) { if ($o) { try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($o) } catch {} } }

# ảnh: đồ thị của mẫu (PNG 600×450) + hai ảnh một màu
# PowerShell 5.1 làm mất dấu " khi truyền mã qua node -e → ghi mã ra tệp tạm rồi chạy (argv: node, tệp, tham số…)
function ChayNode($ma) {
  $f = Join-Path $tam ('m' + [guid]::NewGuid().ToString('N') + '.cjs')
  [IO.File]::WriteAllText($f, $ma, (New-Object Text.UTF8Encoding $false))
  & node $f @args
  if ($LASTEXITCODE) { throw ('node lỗi ' + $LASTEXITCODE) }
}
$js = @'
const [, , tam, goc] = process.argv; const fs = require('fs'), path = require('path');
const mau = require(path.join(goc, 'tools', 'tao-mau.cjs')), t = require(path.join(goc, 'tests', 'fixtures', 'xlsx', 'tao-xlsx.cjs'));
fs.writeFileSync(path.join(tam, 'do-thi.png'), mau.veDoThi());
fs.writeFileSync(path.join(tam, 'hinh-do.png'), t.taoPng(48, 36, [210, 18, 53]));
fs.writeFileSync(path.join(tam, 'hinh-xanh.png'), t.taoPng(36, 36, [35, 50, 140]));
'@
ChayNode $js $tam $goc
$L = [char]10

# ======================= Excel =======================
if ($chi -eq 'tat-ca' -or $chi -eq 'excel') {
  $xl = New-Object -ComObject Excel.Application
  $p = 0; [void][NhW32]::GetWindowThreadProcessId([IntPtr]$xl.Hwnd, [ref]$p); GhiPid 'EXCEL' $p
  $xl.Visible = $false; $xl.DisplayAlerts = $false
  $sepCu = @($xl.UseSystemSeparators, $xl.DecimalSeparator, $xl.ThousandsSeparator)
  try {
    # ---------- 1. office-giao-vien.xlsx ----------
    Copy-Item (Join-Path $goc 'mau\Mau-ngan-hang-cau-hoi.xlsx') (Join-Path $tam 'mau.xlsx')
    $wb = $xl.Workbooks.Open((Join-Path $tam 'mau.xlsx'))
    $wb.RemovePersonalInformation = $true
    $ws = $wb.Worksheets.Item(1)
    [void]$ws.Range('2:18').EntireRow.Delete()          # xoá các dòng ví dụ (ảnh ví dụ phải mất theo)
    $NH = 'Toán 6 – Phân số (thử)'
    $hang = @(
      # B: loại, C: nội dung, E..H: A..D, M: đáp án, O: lời giải, Q: mức độ, R: chủ đề
      @(2, 'TN – Một đáp án', 'Giá trị của biểu thức $\frac{1}{2}+\frac{1}{3}$ bằng', '5/6', '2/5', '1/6', '5/12', 'A', 'Quy đồng mẫu số: $\frac{3}{6}+\frac{2}{6}=\frac{5}{6}$.', 'NB', 'Cộng phân số'),
      @(3, 'NĐ – Nhiều đáp án', ('Chọn các phân số bằng $\frac{1}{2}$:' + $L + '(chọn tất cả đáp án đúng)'), '2/4', '3/5', '50/100', '4/6', 'A, C', '', 'TH', 'Phân số bằng nhau'),
      @(4, 'ĐOẠN – Đoạn dẫn', ('Một chiếc bánh được chia thành 8 phần bằng nhau.' + $L + 'An ăn 3 phần, em An ăn 2 phần.' + $L + 'Dựa vào thông tin trên, trả lời hai câu tiếp theo.'), '', '', '', '', '', '', '', ''),
      @(5, 'TN – Một đáp án', 'Hai bạn đã ăn bao nhiêu phần chiếc bánh?', '3/8', '5/8', '2/8', '1/2', 'B', '', 'TH', 'Cộng phân số'),
      @(6, 'TLN – Trả lời ngắn', 'Phần bánh còn lại chiếm bao nhiêu phần chiếc bánh? (viết dạng phân số tối giản)', '', '', '', '', '3/8', '', 'TH', 'Trừ phân số'),
      @(7, 'ĐOẠN – Đoạn dẫn', 'HẾT', '', '', '', '', '', '', '', ''),
      @(8, 'ĐS – Đúng/Sai', 'Cho phân số $\frac{6}{8}$. Mỗi khẳng định sau đúng hay sai?', 'Phân số đã cho bằng $\frac{3}{4}$', 'Phân số đã cho lớn hơn 1', 'Phân số đã cho là phân số tối giản', 'Phân số đã cho bằng 0,75', 'Đ S S Đ', '', 'TH', 'Rút gọn phân số'),
      @(9, 'SỐ – Điền số', 'Viết $3 : 4$ dưới dạng số thập phân (dùng dấu chấm, ví dụ 1.5).', '', '', '', '', '0,75', '', 'VD', 'Số thập phân'),
      @(10, 'ĐIỀN – Điền khuyết', 'Điền số thích hợp: 1/2 = [[2]]/4 = 3/[[6]]', '', '', '', '', '', '', 'NB', 'Phân số bằng nhau'),
      @(11, 'CHỌN – Chọn từ danh sách', 'Phân số $\frac{2}{4}$ [[*bằng|lớn hơn|nhỏ hơn]] $\frac{1}{2}$, còn $\frac{3}{4}$ [[bằng|*lớn hơn|nhỏ hơn]] $\frac{1}{2}$.', '', '', '', '', '', '', 'TH', 'So sánh phân số'),
      @(12, 'GHÉP – Ghép nối', 'Ghép mỗi phân số với số thập phân bằng nó.', '1/2 => 0,5', '1/4 => 0,25', '3/4 => 0,75', 'Nhiễu: 0,2; 1,5', '', '', 'NB', 'Số thập phân'),
      @(13, 'TL – Tự luận', 'So sánh hai phân số $\frac{3}{5}$ và $\frac{4}{7}$. Trình bày cách làm.', '', '', '', '', '3/5 > 4/7', ('Quy đồng: $\frac{3}{5}=\frac{21}{35}$, $\frac{4}{7}=\frac{20}{35}$.' + $L + 'Vì 21 > 20 nên $\frac{3}{5}>\frac{4}{7}$.'), 'VD', 'So sánh phân số'),
      @(14, 'TN – Một đáp án', 'Hình nào được tô màu đỏ?', '', '', 'Cả hai hình', 'Không hình nào', 'A', '', 'NB', 'Hình học'),
      @(15, 'TN – Một đáp án', 'Cách đọc đúng của phân số $\frac{3}{7}$ là', 'ba phần bảy', 'bảy phần ba', 'ba bảy', 'bảy ba', 'A', '', 'NB', 'Khái niệm phân số')
    )
    foreach ($h in $hang) {
      $r = $h[0]
      $ws.Range('B' + $r).Value2 = $h[1]; $ws.Range('C' + $r).Value2 = $h[2]
      $cot = @('E', 'F', 'G', 'H')
      for ($i = 0; $i -lt 4; $i++) { if ($h[3 + $i] -ne '') { $ws.Range($cot[$i] + $r).Value2 = $h[3 + $i] } }
      if ($h[7] -ne '') { $ws.Range('M' + $r).Value2 = $h[7] }
      if ($h[8] -ne '') { $ws.Range('O' + $r).Value2 = $h[8] }
      if ($h[9] -ne '') { $ws.Range('Q' + $r).Value2 = $h[9] }
      if ($h[10] -ne '') { $ws.Range('R' + $r).Value2 = $h[10] }
    }
    # STT: công thức bỏ qua dòng ĐOẠN (kết quả "" → ô t="str" rỗng) kéo xuống; từ dòng 9 hết dòng ĐOẠN nên dùng =A8+1 kéo xuống
    # → Excel lưu thành công thức dùng chung (<f t="shared" ref=… si=…>, các ô sau chỉ có <f t="shared" si=…/>)
    $ws.Range('A2').Formula = '=IF(LEFT(B2,4)="ĐOẠN","",MAX($A$1:A1)+1)'
    [void]$ws.Range('A2:A8').FillDown()
    $ws.Range('A9').Formula = '=A8+1'
    [void]$ws.Range('A9:A15').FillDown()
    # Điểm: gõ "0,25" như trên máy đặt kiểu số Việt Nam (dấu phẩy thập phân), công thức =1/2, số thường
    $xl.UseSystemSeparators = $false; $xl.DecimalSeparator = ','; $xl.ThousandsSeparator = '.'
    foreach ($r in @(2, 5, 6)) { $ws.Range('N' + $r).FormulaLocal = '0,25' }
    $xl.DecimalSeparator = $sepCu[1]; $xl.ThousandsSeparator = $sepCu[2]; $xl.UseSystemSeparators = $sepCu[0]
    $ws.Range('N3').Formula = '=1/2'
    foreach ($r in @(8, 12, 13)) { $ws.Range('N' + $r).Value2 = 1 }
    $ws.Range('N9').Value2 = 0.5
    # chữ nghiêng / đậm một phần ô
    $c = $ws.Range('C3'); $c.Characters(([string]$c.Value2).IndexOf('(') + 1, 26).Font.Italic = $true
    $c = $ws.Range('E15'); $c.Characters(4, 4).Font.Bold = $true
    # Ngân hàng: gộp một ô cho cả cột
    $ws.Range('P2').Value2 = $NH
    [void]$ws.Range('P2:P15').Merge()
    # ghi chú ô (comment kiểu cũ → VML + comments1.xml)
    [void]$ws.Range('C13').AddComment('Câu này chấm tay.')
    # lọc ở dòng tiêu đề
    [void]$ws.Range('A1:R15').AutoFilter()
    # ảnh dán nổi trên dòng 5 (cột Ảnh) + văn bản thay thế
    $o = $ws.Range('D5')
    $pic = $ws.Shapes.AddPicture((Join-Path $tam 'do-thi.png'), 0, -1, $o.Left + 3, $o.Top + 3, 120, 90)
    $pic.AlternativeText = 'Hình tròn chia 8 phần bằng nhau'
    $ws.Rows.Item(5).RowHeight = 100
    # ảnh "Đặt trong ô" ở cột phương án A, B của dòng 14
    $ws.Activate()
    [void]$ws.Range('E14').Select(); [void]$ws.Range('E14').InsertPictureInCell((Join-Path $tam 'hinh-do.png'))
    [void]$ws.Range('F14').Select(); [void]$ws.Range('F14').InsertPictureInCell((Join-Path $tam 'hinh-xanh.png'))
    [void]$ws.Range('C2').Select()
    $wb.SaveAs((Join-Path $dir 'office-giao-vien.xlsx'), 51)
    $wb.Close($false); Nha $ws; Nha $wb

    # ---------- 2. office-tu-lam.xlsx ----------
    $wb = $xl.Workbooks.Add()
    $wb.RemovePersonalInformation = $true
    while ($wb.Worksheets.Count -lt 2) { [void]$wb.Worksheets.Add([Type]::Missing, $wb.Worksheets.Item($wb.Worksheets.Count)) }
    $ws = $wb.Worksheets.Item(1); $ws.Name = 'Đề 15 phút'
    $ds = $wb.Worksheets.Item(2); $ds.Name = 'DS'
    $loai = @('TN', 'NĐ', 'ĐS', 'TLN', 'SỐ', 'ĐIỀN', 'CHỌN', 'GHÉP', 'TL', 'ĐOẠN')
    for ($i = 0; $i -lt $loai.Count; $i++) { $ds.Cells.Item($i + 1, 1).Value2 = $loai[$i] }
    $ws.Range('A1').Value2 = 'ĐỀ KIỂM TRA 15 PHÚT – LỚP 6'
    [void]$ws.Range('A1:I1').Merge(); $ws.Range('A1').Font.Bold = $true
    $td = @('Câu', 'Loại', 'Nội dung', 'Phương án A', 'Phương án B', 'Phương án C', 'Phương án D', 'Đáp án', 'Điểm')
    for ($i = 0; $i -lt $td.Count; $i++) { $ws.Cells.Item(2, $i + 1).Value2 = $td[$i] }
    # gõ như người dùng (ô General): 1/2, 8/3 → Excel đổi thành ngày tháng; 25% → số 0,25 định dạng %
    $dl = @(
      @(3, 1, 'TN', 'Phân số nào lớn nhất?', '1/2', '1/3', '2/3', '3/4', 'D'),
      @(4, 2, 'TN', 'Tỉ lệ học sinh nữ của lớp (12 nữ / 20 học sinh) là', '25%', '50%', '60%', '75%', 'C'),
      @(5, 3, 'TLN', 'Viết phân số có tử số 8, mẫu số 3.', '', '', '', '', '8/3'),
      @(6, 4, 'TN', 'Kết quả của 0,5 + 0,25 là', '', '', '', '', 'A'),
      @(7, 5, 'TN', 'Phân số nào bằng 0,5?', '', '', '', '', 'A'),
      @(8, 6, 'TN', 'Ngày Quốc khánh nước Cộng hoà xã hội chủ nghĩa Việt Nam là', '', '', '', '', 'A'),
      @(9, 7, 'TN', 'So sánh $\frac{2}{3}$ và $\frac{3}{4}$: $\frac{2}{3}$ … $\frac{3}{4}$', '<', '>', '=', 'Không so sánh được', 'A')
    )
    foreach ($h in $dl) {
      $r = $h[0]
      $ws.Range('A' + $r).Value2 = [double]$h[1]; $ws.Range('B' + $r).Value2 = $h[2]; $ws.Range('C' + $r).Value2 = $h[3]
      $cot = @('D', 'E', 'F', 'G')
      for ($i = 0; $i -lt 4; $i++) { if ($h[4 + $i] -ne '') { $ws.Range($cot[$i] + $r).Value = $h[4 + $i] } }
      $ws.Range('H' + $r).Value = $h[8]
      $ws.Range('I' + $r).Value2 = 1
    }
    # (gán số qua .Formula dạng chữ: PowerShell 5.1 báo lỗi ép kiểu khi gán Value2 cho ô vừa đổi NumberFormat)
    # số có định dạng 0.00 (Excel hiện 0,75 / 0,50 …)
    $v = @(0.75, 0.5, 0.7, 1.25); for ($i = 0; $i -lt 4; $i++) { $o = $ws.Cells.Item(6, 4 + $i); $o.NumberFormat = '0.00'; $o.Formula = ([double]$v[$i]).ToString([cultureinfo]::InvariantCulture) }
    # định dạng Phân số (# ?/?): gõ 0,5 hiện 1/2
    $v = @(0.5, 0.25, 0.75, 1.5); for ($i = 0; $i -lt 4; $i++) { $o = $ws.Cells.Item(7, 4 + $i); $o.NumberFormat = '# ?/?'; $o.Formula = ([double]$v[$i]).ToString([cultureinfo]::InvariantCulture) }
    # ngày tháng có định dạng rõ ràng dd/mm/yyyy
    $ng = @(@(1945, 9, 2), @(1945, 8, 19), @(1954, 5, 7), @(1975, 4, 30))
    for ($i = 0; $i -lt 4; $i++) { $o = $ws.Cells.Item(8, 4 + $i); $o.NumberFormat = 'dd/mm/yyyy'; $o.Formula = [string]([datetime]::new($ng[$i][0], $ng[$i][1], $ng[$i][2])).ToOADate() }
    # hộp văn bản nổi trên dòng 9 (gợi ý viết tay) — công cụ không đọc được
    $o = $ws.Range('C9')
    $tb = $ws.Shapes.AddTextbox(1, $o.Left + 200, $o.Top + 2, 140, 18)
    $tb.TextFrame2.TextRange.Text = 'Gợi ý: quy đồng mẫu số'
    # danh sách thả xuống lấy từ trang khác (Excel ghi vào x14:dataValidations)
    $dv = $ws.Range('B3:B30').Validation; $dv.Delete(); [void]$dv.Add(3, 1, 1, '=DS!$A$1:$A$10')
    $ds.Visible = 0
    # Format as Table
    [void]$ws.ListObjects.Add(1, $ws.Range('A2:I9'), [Type]::Missing, 1)
    $ws.Activate(); [void]$ws.Range('C3').Select()
    $wb.SaveAs((Join-Path $dir 'office-tu-lam.xlsx'), 51)
    $wb.Close($false); Nha $ws; Nha $ds; Nha $wb
  } finally {
    try { $xl.DecimalSeparator = $sepCu[1]; $xl.ThousandsSeparator = $sepCu[2]; $xl.UseSystemSeparators = $sepCu[0] } catch {}
    try { $xl.Quit() } catch {}
    Nha $xl
  }
}

# ======================= Word =======================
if ($chi -eq 'tat-ca' -or $chi -eq 'word') {
  $truoc = @(Get-Process WINWORD -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
  $wd = New-Object -ComObject Word.Application
  Start-Sleep -Milliseconds 300
  $moi = @(Get-Process WINWORD -ErrorAction SilentlyContinue | ForEach-Object { $_.Id } | Where-Object { $truoc -notcontains $_ })
  if ($moi.Count -eq 1) { GhiPid 'WORD' $moi[0] }
  $wd.Visible = $false; $wd.DisplayAlerts = 0
  try {
    Copy-Item (Join-Path $goc 'mau\Mau-ngan-hang-cau-hoi.docx') (Join-Path $tam 'mau.docx')
    # FileName, ConfirmConversions, ReadOnly, AddToRecentFiles, PasswordDocument, PasswordTemplate, Revert, WritePasswordDocument,
    # WritePasswordTemplate, Format, Encoding, Visible, OpenAndRepair, DocumentDirection, NoEncodingDialog
    $d = $wd.Documents.Open((Join-Path $tam 'mau.docx'), $false, $false, $false, '', '', $false, '', '', 0, 65001, $true, $false, 0, $true)   # Visible=$true: tài liệu cần cửa sổ (ẩn theo Word) để có Selection
    # (không bật RemovePersonalInformation: Word hiện hộp thoại cảnh báo quyền riêng tư khi lưu → treo; tên người được xoá ở bước cuối)
    Buoc 'word: đã mở mẫu'
    $s = $wd.Selection
    [void]$s.EndKey(6)                                      # cuối tài liệu
    $s.InsertBreak(7)                                       # ngắt trang
    $s.Style = $d.Styles.Item('Normal')
    function Go($t) { $s.TypeText($t) }
    function Dong($t) { $s.TypeText($t); $s.TypeParagraph() }
    # công thức: gõ ⟦dạng tuyến tính⟧ (⟪…⟫ = công thức khối) rồi đổi bằng OMaths.Add + BuildUp như khi bấm Alt + =
    Buoc 'word: gõ câu hỏi'
    Dong 'NGÂN HÀNG: Vật lí 10 – Chuyển động (thử)'
    Dong 'ĐIỂM MẶC ĐỊNH: 0,5'
    # Câu 1: công thức trong nội dung và phương án; đáp án = gạch chân nhãn (không có dòng Đáp án)
    Dong 'Câu 1. [NB] Một vật rơi tự do từ độ cao h, thời gian rơi là ⟦t=√(2h/g)⟧. Vận tốc lúc chạm đất là'
    $nhan = @('A', 'B', 'C', 'D'); $pa = @('⟦v=√(2gh)⟧', '⟦v=2gh⟧', '⟦v=√(gh)⟧', '⟦v=gh/2⟧')
    for ($i = 0; $i -lt 4; $i++) {
      $bd = $s.Start; Go ($nhan[$i] + '. ' + $pa[$i])
      if ($i -eq 0) { $d.Range($bd, $bd + 1).Font.Underline = 1 }
      $s.TypeParagraph()
    }
    Dong 'Lời giải: Từ ⟦v^2=2gh⟧ suy ra ⟦v=√(2gh)⟧.'
    # Câu 2: ảnh chèn cùng dòng có văn bản thay thế; phương án do Word tự đánh số A. B. C. D.
    Dong 'Câu 2. [TH] Đồ thị dưới đây biểu diễn chuyển động của một vật.'
    $ish = $s.InlineShapes.AddPicture((Join-Path $tam 'do-thi.png'), $false, $true)
    $ish.Width = 180; $ish.Height = 135; $ish.AlternativeText = 'Đồ thị li độ theo thời gian'
    $s.TypeParagraph()
    Dong 'Vật đổi chiều chuyển động bao nhiêu lần?'
    $bdDS = $s.Start
    Dong '1 lần'; Dong '2 lần'; Dong '3 lần'; Go 'Không lần nào'
    $lt = $d.ListTemplates.Add($false)                      # danh sách riêng của tài liệu (không sửa thư viện của Word)
    $lv = $lt.ListLevels.Item(1); $lv.NumberStyle = 3; $lv.NumberFormat = '%1.'   # 3 = chữ in hoa A, B, C
    $d.Range($bdDS, $s.End).ListFormat.ApplyListTemplate($lt, $false, 0)
    $s.TypeParagraph(); $s.Range.ListFormat.RemoveNumbers()
    Dong 'Đáp án: B'
    # Câu 3: Đúng/Sai, dòng Đáp án dạng a) Đúng …
    Dong 'Câu 3. (1 điểm) [TH] Một ô tô chuyển động thẳng đều với vận tốc 54 km/h.'
    Dong 'a) Vận tốc của ô tô là ⟦15 m/s⟧.'
    Dong 'b) Sau 2 giờ ô tô đi được 100 km.'
    Dong 'c) Gia tốc của ô tô bằng 0.'
    Dong 'Đáp án: a) Đúng b) Sai c) Đúng'
    # Câu 4: điền số, lời giải có công thức khối riêng một dòng
    Dong 'Câu 4. [VD] [SỐ] Một vật rơi tự do từ độ cao 20 m, lấy g = 10 m/s². Thời gian rơi là bao nhiêu giây?'
    Dong 'Đáp án: 2'
    Dong 'Lời giải:'
    Dong '⟪t=√(2h/g)=√(2⋅20/10)=2⟫'
    # Câu 5: phương án trong bảng 2×2, đáp án tô nền nhãn
    Dong 'Câu 5. [NB] Đơn vị của gia tốc trong hệ SI là'
    Buoc 'word: bảng 2×2'
    $tb = $d.Tables.Add($s.Range, 2, 2)
    $tb.Borders.Enable = $false
    $o4 = @('m/s', 'm/s²', 'km/h', 'm')
    for ($i = 0; $i -lt 4; $i++) { $tb.Cell([math]::Floor($i / 2) + 1, ($i % 2) + 1).Range.Text = $nhan[$i] + '. ' + $o4[$i] }
    $o2 = $tb.Cell(1, 2).Range; $o2.SetRange($o2.Start, $o2.Start + 1); $o2.HighlightColorIndex = 7
    [void]$s.EndKey(6)
    Dong 'Câu 6. [TH] [TLN] Đổi 72 km/h ra m/s.'
    Go 'Đáp án: 20'
    # đổi mọi ⟦…⟧ / ⟪…⟫ thành công thức Word thật
    Buoc 'word: đổi công thức'
    foreach ($kieu in @(@('⟦', '⟧', 1), @('⟪', '⟫', 0))) {
      for ($vong = 0; $vong -lt 40; $vong++) {
        $r = $d.Content; $f = $r.Find; $f.ClearFormatting()
        if (-not $f.Execute($kieu[0] + '[!' + $kieu[1] + ']@' + $kieu[1], $false, $false, $true, $false, $false, $true, 0)) { break }
        $t = $r.Text; Buoc ('  công thức ' + $t); $r.Text = $t.Substring(1, $t.Length - 2)
        $m = $d.OMaths.Add($r)
        $om = $m.OMaths.Item(1); $om.BuildUp()
        if ($kieu[2] -eq 0) { $om.Type = 0 }               # 0 = công thức khối (display)
      }
    }
    Buoc 'word: lưu'
    $d.SaveAs2([ref](Join-Path $tam 'office-giao-vien.docx'), [ref]16)
    Buoc 'word: đã lưu'
    $d.Close([ref]0)
    Copy-Item (Join-Path $tam 'office-giao-vien.docx') (Join-Path $dirDocx 'office-giao-vien.docx') -Force
  } finally {
    foreach ($x in @($wd.Documents)) { try { $x.Close([ref]0) } catch {} }
    try { $wd.Quit([ref]0) } catch {}
    Nha $wd
  }
}

# ======================= xoá dấu vết máy =======================
$js = @'
const zip = require(process.argv[2]); const fs = require('fs');
(async () => {
  for (const p of process.argv.slice(3)) {
    if (!fs.existsSync(p)) continue;
    const z = await zip.readZip(fs.readFileSync(p));
    const files = Object.keys(z).map((k) => {
      let d = z[k];
      if (/^(docProps\/core\.xml|xl\/workbook\.xml|xl\/richData\/rdrichvalue\.xml|word\/settings\.xml|xl\/comments\d*\.xml|xl\/drawings\/vmlDrawing\d*\.vml)$/.test(k)) {
        d = Buffer.from(d).toString()
          .replace(/<dc:creator>[^<]*<\/dc:creator>/, '<dc:creator></dc:creator>')
          .replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy></cp:lastModifiedBy>')
          .replace(/<mc:AlternateContent[^>]*><mc:Choice Requires="x15"><x15ac:absPath [^>]*\/><\/mc:Choice><\/mc:AlternateContent>/, '')
          // ảnh "Đặt trong ô": Excel lưu đường dẫn tệp gốc làm văn bản thay thế → thay bằng đường dẫn giả
          .replace(/<v>[A-Za-z]:\\[^<]*\\([^\\<]+)<\/v>/g, (m, ten) => '<v>C:\\Users\\GiaoVien\\Pictures\\' + ten + '</v>')
          .replace(/<author>[^<]*<\/author>/g, '<author>Giáo viên</author>');
      }
      return { path: k, data: d };
    });
    fs.writeFileSync(p, await zip.writeZip(files, { date: new Date(2026, 9, 2) }));
  }
})();
'@
ChayNode $js (Join-Path $goc 'js\zip.js') (Join-Path $dir 'office-giao-vien.xlsx') (Join-Path $dir 'office-tu-lam.xlsx') (Join-Path $dirDocx 'office-giao-vien.docx')
Remove-Item -Recurse -Force $tam -Confirm:$false -ErrorAction SilentlyContinue
Write-Output 'Đã tạo office-*.xlsx / office-*.docx'
