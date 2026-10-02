# tests/fixtures/docx/tao-word.ps1 — dựng các fixture word-*.docx bằng Word thật (COM), mô phỏng cấu trúc các đề thật của trường
# (nội dung tự soạn, không chép đề thật): công thức Office Math gõ tuyến tính rồi BuildUp, danh sách Word tự đánh số, tô nền, gạch chân,
# bảng (gộp ô, bảng lồng), ảnh PNG chèn cùng dòng. XML do Word ghi ra là "sự thật" để tests/docx-word.test.cjs kiểm bộ đọc.
# Chạy (cần Word, nên chạy nền): powershell -ExecutionPolicy Bypass -File tests\fixtures\docx\tao-word.ps1 [ten-fixture …]
#   word-thpt + word-thpt-hdc       : đề THPT 2025 (PHẦN I/II/III, phương án cách tab, bảng số liệu, ảnh, công thức) + file hướng dẫn chấm
#   word-ielts                      : đề đọc IELTS bôi vàng đáp án (ô trống đánh số, TRUE/FALSE/NOT GIVEN, chọn HAI chữ cái)
#   word-tieu-hoc + word-tieu-hoc-key : đề tiểu học dàn trong bảng (ví dụ 0., ảnh làm phương án, bảng lồng) + bảng Item | Key
#   word-tieng-anh + word-tieng-anh-key : đề tiếng Anh đánh số "1." (phương án cùng dòng, gạch chân âm, tìm lỗi sai, đoạn văn điền từ)
#   word-upload                     : mẫu upload câu hỏi [OC-NB] … ANSWER (FB, SDL, MC có trọng số, ES, câu chùm EM)
#   word-danh-so                    : mẫu NGÂN HÀNG với "Câu %1." theo kiểu đoạn + phương án Word tự đánh số A. B. C. D.
# Chỉ đóng/thoát đúng Word do script tạo ra (Quit trong finally); không đụng Word người dùng đang mở. Xoá tên tác giả bằng Node.
$ErrorActionPreference = 'Stop'
$chi = @($args)
$dir = $PSScriptRoot
$goc = (Resolve-Path (Join-Path $dir '..\..\..')).Path
$tam = Join-Path $env:TEMP ('nh-word-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $tam | Out-Null
Add-Type -AssemblyName System.Drawing
function Buoc($t) { $d0 = (Get-Date -Format 'HH:mm:ss') + ' ' + $t; Write-Output $d0; if ($env:NH_LOG) { Add-Content -Path $env:NH_LOG -Value $d0 -Encoding UTF8 } }
function Can($ten) { return (-not $chi.Count) -or ($chi -contains $ten) }

# ---------- ảnh PNG tự vẽ ----------
function VeAnh([string]$ten, [string]$chu, [string]$hinh) {
  $bmp = New-Object System.Drawing.Bitmap 120, 90
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::White)
  $but = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(35, 50, 140)), 3
  switch ($hinh) {
    'tron' { $g.DrawEllipse($but, 20, 10, 80, 50) }
    'vuong' { $g.DrawRectangle($but, 25, 10, 70, 50) }
    'binh' { $g.DrawEllipse($but, 35, 25, 50, 40); $g.DrawRectangle($but, 52, 5, 16, 22) }
    default { $g.DrawLine($but, 10, 60, 110, 10); $g.DrawLine($but, 10, 10, 110, 60) }
  }
  $font = New-Object System.Drawing.Font 'Arial', 11
  $g.DrawString($chu, $font, [System.Drawing.Brushes]::Black, 8, 66)
  $g.Dispose()
  $bmp.Save((Join-Path $tam ($ten + '.png')), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
VeAnh 'binh-cau' 'flask' 'binh'
VeAnh 'logo' 'TRUONG MAU' 'vuong'
VeAnh 'bag' 'bag' 'vuong'
VeAnh 'bed' 'bed' 'vuong'
VeAnh 'bus' 'bus' 'tron'
VeAnh 'cake' 'cake' 'tron'
VeAnh 'cup' 'cup' 'binh'
VeAnh 'car' 'car' 'tron'
VeAnh 'dog' 'dog' 'x'
VeAnh 'duck' 'duck' 'tron'
VeAnh 'door' 'door' 'vuong'
VeAnh 'cat' 'cat' 'x'
VeAnh 'fish' 'fish' 'tron'

# ---------- ghi nội dung bằng Range (không dùng Selection → không bị "tự định dạng khi gõ") ----------
$script:D = $null
function ViTriCuoi { return $script:D.Content.End - 1 }
function ChenChu([int]$pos, [string]$t, [hashtable]$f) {
  $r = $script:D.Range($pos, $pos)
  $r.Text = $t
  $r.Font.Bold = $(if ($f.b) { -1 } else { 0 })
  $r.Font.Italic = $(if ($f.i) { -1 } else { 0 })
  $r.Font.Underline = $(if ($f.u) { 1 } else { 0 })
  $r.Font.Superscript = $(if ($f.sup) { -1 } else { 0 })
  if ($f.sub) { $r.Font.Subscript = -1 }
  $r.HighlightColorIndex = $(if ($f.hl) { 7 } else { 0 })
  $r.Font.Color = $(if ($f.red) { 255 } else { -16777216 })
  return $r.End
}
function ChenAnh([int]$pos, [string]$ten) {
  $sh = $script:D.InlineShapes.AddPicture((Join-Path $tam ($ten + '.png')), $false, $true, $script:D.Range($pos, $pos))
  $sh.AlternativeText = 'Hình ' + $ten
  return $sh.Range.End
}
# markup: {hl:…} tô vàng, {u:…} gạch chân, {red:…} chữ đỏ, {b:…}, {i:…}, {sup:…}, {sub:…}, kết hợp {hl,u:…}; {img:tên} ảnh;
# ⟦…⟧ công thức (đổi sang Office Math ở cuối); tab dùng `t
function ChenMarkup([int]$pos, [string]$s) {
  $re = [regex]'\{([a-z,]+):([^{}]*)\}'
  $i = 0
  foreach ($m in $re.Matches($s)) {
    if ($m.Index -gt $i) { $pos = ChenChu $pos $s.Substring($i, $m.Index - $i) @{} }
    $kieu = @{}
    foreach ($k in $m.Groups[1].Value.Split(',')) { $kieu[$k] = $true }
    if ($kieu.img) { $pos = ChenAnh $pos $m.Groups[2].Value } else { $pos = ChenChu $pos $m.Groups[2].Value $kieu }
    $i = $m.Index + $m.Length
  }
  if ($i -lt $s.Length) { $pos = ChenChu $pos $s.Substring($i) @{} }
  return $pos
}
# đoạn mới ở cuối tài liệu; trả về vị trí đầu/cuối (số) của đoạn vừa viết — đối tượng Paragraph/Range của Word
# tự dời khi chèn đoạn sau nó nên không giữ lại
function Doan([string]$s) {
  [void](ChenMarkup (ViTriCuoi) $s)
  $r0 = $script:D.Paragraphs.Last.Range
  $p = @{ s = $r0.Start; e = $r0.End }
  $script:D.Content.InsertParagraphAfter()
  $moi = $script:D.Paragraphs.Last
  $moi.Range.ListFormat.RemoveNumbers()
  $moi.Style = -1
  return $p
}
function Doans([string[]]$ds) { foreach ($x in $ds) { [void](Doan $x) } }
# ô bảng: chuỗi markup (đoạn ngăn bằng ¶), bảng lồng @{ bang = …; vien = … }, hoặc mảng các thứ đó
function DienO($cell, $val) {
  $ds = if ($val -is [array]) { $val } else { @($val) }
  $dau = $true
  foreach ($x in $ds) {
    if ($x -is [hashtable]) {
      if (-not $dau) { $p0 = $cell.Range.End - 1; $script:D.Range($p0, $p0).Text = [string][char]13 }
      $p1 = $cell.Range.End - 1
      [void](BangTai $script:D.Range($p1, $p1) $x.bang $x)
      $dau = $false
      continue
    }
    $doan = ([string]$x).Split([char]0x00B6)
    foreach ($d1 in $doan) {
      if (-not $dau) { $p0 = $cell.Range.End - 1; $script:D.Range($p0, $p0).Text = [string][char]13 }
      [void](ChenMarkup ($cell.Range.End - 1) $d1)
      $dau = $false
    }
  }
}
function BangTai($r, [object[]]$hang, [hashtable]$o) {
  $nr = $hang.Count
  $nc = 0; foreach ($h in $hang) { if ($h.Count -gt $nc) { $nc = $h.Count } }
  $t = $script:D.Tables.Add($r, $nr, $nc)
  $t.Borders.Enable = $(if ($o.vien -eq $false) { 0 } else { 1 })
  for ($i = 0; $i -lt $nr; $i++) {
    for ($j = 0; $j -lt $hang[$i].Count; $j++) {
      $v = $hang[$i][$j]
      if ($null -ne $v -and "$v" -ne '') { DienO $t.Cell($i + 1, $j + 1) $v }
    }
  }
  if ($o.gop) { foreach ($g in $o.gop) { $t.Cell($g[0], $g[1]).Merge($t.Cell($g[2], $g[3])) } }
  return $t
}
function Bang([object[]]$hang, [hashtable]$o = @{}) { [void](BangTai $script:D.Range((ViTriCuoi), (ViTriCuoi)) $hang $o) }
# danh sách Word tự đánh số
function MauDS([string]$dang, [int]$kieu, [int]$batDau = 1) {
  $lt = $script:D.ListTemplates.Add($false)
  $lv = $lt.ListLevels.Item(1)
  $lv.NumberFormat = $dang; $lv.NumberStyle = $kieu; $lv.StartAt = $batDau; $lv.TrailingCharacter = 0
  return $lt
}
function DanhSo($pDau, $pCuoi, $lt) { $script:D.Range($pDau.s, $pCuoi.e - 1).ListFormat.ApplyListTemplate($lt, $false, 0) }
function CacPA($lt, [string[]]$ds) {
  $dau = $null; $cuoi = $null
  foreach ($x in $ds) { $p = Doan $x; if (-not $dau) { $dau = $p }; $cuoi = $p }
  DanhSo $dau $cuoi $lt
}
# ⟦…⟧ → Office Math (như khi bấm Alt + = rồi gõ dạng tuyến tính)
function DoiCongThuc {
  for ($vong = 0; $vong -lt 200; $vong++) {
    $r = $script:D.Content; $f = $r.Find; $f.ClearFormatting()
    if (-not $f.Execute('⟦[!⟧]@⟧', $false, $false, $true, $false, $false, $true, 0)) { break }
    $t = $r.Text; $r.Text = $t.Substring(1, $t.Length - 2)
    $m = $script:D.OMaths.Add($r)
    $m.OMaths.Item(1).BuildUp()
  }
}

$script:W = $null
$truoc = @(Get-Process WINWORD -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
$daTao = @()
try {
  $script:W = New-Object -ComObject Word.Application
  Start-Sleep -Milliseconds 300
  $moi = @(Get-Process WINWORD -ErrorAction SilentlyContinue | ForEach-Object { $_.Id } | Where-Object { $truoc -notcontains $_ })
  Buoc ('Word PID ' + ($moi -join ','))
  $script:W.Visible = $false
  $script:W.DisplayAlerts = 0
  function TaiLieu([string]$ten, [scriptblock]$viet) {
    if (-not (Can $ten)) { return }
    Buoc ('viết ' + $ten)
    $script:D = $script:W.Documents.Add()
    try {
      & $viet
      DoiCongThuc
      $script:D.SaveAs2([ref](Join-Path $tam ($ten + '.docx')), [ref]16)
      $script:daTao += $ten
    } finally { $script:D.Close([ref]0); $script:D = $null }
  }

  # ======================= word-thpt: đề THPT 2025 (không có đáp án trong đề) =======================
  TaiLieu 'word-thpt' {
    Bang @(, @('{img:logo}¶TRƯỜNG THPT MẪU', '{b:ĐỀ KIỂM TRA THỬ}¶MÔN: KHOA HỌC TỰ NHIÊN¶Thời gian làm bài: 45 phút')) @{ vien = $false }
    Doan 'Họ và tên: ……………………… Số báo danh: ………' | Out-Null
    Doan '{b:PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.} Thí sinh trả lời từ câu 1 đến câu 4. Mỗi câu hỏi thí sinh chỉ chọn một phương án.' | Out-Null
    Doan '{b:Câu 1.} Giá trị của biểu thức ⟦(2x+1)/(x-1)⟧ tại x = 2 là' | Out-Null
    Doan "A. 5.`tB. 3.`tC. 1.`tD. 7." | Out-Null
    Doan '{b:Câu 2.} Tập xác định của hàm số ⟦y=√(x+3)⟧ là' | Out-Null
    Doan "A. ⟦[-3;+∞)⟧.`tB. ⟦(-3;+∞)⟧." | Out-Null
    Doan "C. ⟦(-∞;-3]⟧.`tD. ⟦ℝ⟧." | Out-Null
    Doan '{b:Câu 3.} Nhiệt độ sôi của ba chất X, Y, Z được ghi trong bảng sau:' | Out-Null
    Bang @(@('Chất', 'X', 'Y', 'Z'), @('Nhiệt độ sôi (°C)', '78', '100', '118'))
    Doan 'Chất có nhiệt độ sôi cao nhất là' | Out-Null
    Doans @('A. X.', 'B. Y.', 'C. Z.', 'D. X và Y.')
    Doan '{b:Câu 4.} Hình vẽ dưới đây mô tả một dụng cụ thí nghiệm.' | Out-Null
    Doan '{img:binh-cau}' | Out-Null
    Doan 'Tên của dụng cụ là' | Out-Null
    CacPA (MauDS '%1.' 3) @('ống nghiệm.', 'bình cầu.', 'phễu.', 'cốc thuỷ tinh.')
    Doan '{b:PHẦN II. Câu trắc nghiệm đúng sai.} Thí sinh trả lời từ câu 1 đến câu 2. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.' | Out-Null
    Doan '{b:Câu 1.} Cho dãy số ⟦u_n=2n+1⟧.' | Out-Null
    Doans @('a) ⟦u_1=3⟧.', 'b) Dãy số đã cho là dãy số giảm.', 'c) ⟦u_(n+1)-u_n=2⟧ với mọi n.', 'd) Tổng 5 số hạng đầu của dãy bằng 35.')
    Doan '{b:Câu 2.} Một vật chuyển động thẳng với vận tốc ⟦v(t)=3t^2⟧ (m/s).' | Out-Null
    Doans @('a) Tại t = 1 s, vận tốc của vật là 3 m/s.', 'b) Vận tốc của vật giảm dần theo thời gian.', 'c) Gia tốc của vật luôn bằng 0.', 'd) Quãng đường vật đi được từ t = 0 đến t = 2 s là 8 m.')
    Doan '{b:PHẦN III. Câu trắc nghiệm yêu cầu trả lời ngắn.} Thí sinh trả lời từ câu 1 đến câu 3.' | Out-Null
    Doan '{b:Câu 1.} Tính tích phân ⟦∫_0^2▒〖2x dx〗⟧.' | Out-Null
    Doan '{b:Câu 2.} Có bao nhiêu số nguyên x thoả mãn ⟦x^2<10⟧?' | Out-Null
    Doan '{b:Câu 3.} Cho các chất: (1) sắt; (2) lưu huỳnh; (3) đồng; (4) oxi. Liệt kê theo thứ tự tăng dần các số ứng với chất là kim loại.' | Out-Null
    Doan '------ HẾT ------' | Out-Null
  }

  # ======================= word-thpt-hdc: hướng dẫn chấm =======================
  TaiLieu 'word-thpt-hdc' {
    Bang @(, @('{img:logo}¶{b:HƯỚNG DẪN CHẤM}', 'ĐỀ KIỂM TRA THỬ¶MÔN: KHOA HỌC TỰ NHIÊN')) @{ vien = $false }
    Doan '{b:Phần I. Câu trắc nghiệm nhiều phương án lựa chọn.}' | Out-Null
    Bang @(@('Câu', '1', '2', '3', '4'), @('Đ/A', 'A', 'A', 'C', 'B'))
    Doan '{b:Phần II. Câu trắc nghiệm đúng – sai.}' | Out-Null
    Bang @(@('Câu 1', '', 'Câu 2', ''), @('a)', 'Đ', 'a)', 'Đ'), @('b)', 'S', 'b)', 'S'), @('c)', 'Đ', 'c)', 'S'), @('d)', 'Đ', 'd)', 'Đ')) @{ gop = @(@(1, 1, 1, 2), @(1, 2, 1, 3)) }
    Doan '{b:Phần III. Câu trắc nghiệm yêu cầu trả lời ngắn.}' | Out-Null
    Doan 'Câu 1.' | Out-Null
    Bang @(, @('4', '', '', ''))
    Doan 'Câu 2.' | Out-Null
    Bang @(, @('7', '', '', ''))
    Doan 'Câu 3.' | Out-Null
    Bang @(, @('1', '3', '', ''))
    Doan '--- HẾT ---' | Out-Null
  }

  # ======================= word-ielts: đề đọc, đáp án bôi vàng =======================
  TaiLieu 'word-ielts' {
    Bang @(, @('{img:logo}', '{b:READING TEST – PRACTICE}¶{hl:ĐỀ THỬ}')) @{ vien = $false }
    Doans @(
      '{b:READING PASSAGE 1}',
      'You should spend about 10 minutes on Questions 1-11, which are based on Reading Passage 1 below.',
      '{b:Rooftop Gardens}',
      'A. City planners in many countries now encourage rooftop gardens because they cool buildings in summer and reduce storm water flowing into drains.',
      'B. A typical green roof holds a thin layer of soil, which weighs less than most people expect, and supports hardy plants such as sedum.',
      'C. Early projects were expensive, but costs fell by half once standard trays became available to builders.',
      'D. Researchers still disagree about how much a single roof can lower the temperature of the street below.',
      '{b:Questions 1-3}',
      'Complete the notes below.',
      'Choose NO MORE THAN TWO WORDS from the passage for each answer.',
      'Benefits: cool buildings and reduce 1 {hl:storm water}',
      'Typical plants: hardy species such as 2 {hl:sedum}',
      'Costs fell by half after standard 3 {hl:trays} appeared',
      '{b:Questions 4-5}',
      'Do the following statements agree with the information given in Reading Passage 1?',
      "TRUE`t`tif the statement agrees with the information",
      "FALSE`t`tif the statement contradicts the information",
      "NOT GIVEN`tif there is no information on this",
      "4`tGreen roofs make buildings warmer in summer.  {hl:[FALSE]}",
      "5`tThe first rooftop garden was built by a school.  {hl:[NOT GIVEN]}",
      '{b:Questions 6-7}',
      'Choose TWO letters, A–E.',
      'Which TWO advantages of green roofs are mentioned in the passage?',
      'A.  lower noise',
      '{hl:B.  cooler buildings}',
      'C.  cheaper insurance',
      '{hl:D.}  less storm water',
      'E.  more birds',
      '{b:Questions 8-9}',
      'Choose the correct letter, A, B, C or D.',
      "8. `tWhat do researchers disagree about?",
      "A`tthe cost of soil",
      "B`tthe weight of trays",
      "{hl:C}`tthe effect on street temperature",
      "D`tthe choice of plants",
      "9. `tWhy did costs fall?",
      "A`tplants became cheaper",
      "{hl:B}`tstandard trays became available",
      "C`tcities paid for the roofs",
      "D`tsoil became lighter",
      '{b:Questions 10-11}',
      'Complete the sentences below.',
      'Sedum is described as a 10 {hl:hardy} plant.',
      '11 {hl:Researchers} still disagree about street temperatures.',
      '— THE END —'
    )
  }

  # ======================= word-tieu-hoc: đề tiểu học dàn trong bảng =======================
  TaiLieu 'word-tieu-hoc' {
    Bang @(, @('{img:logo}', '{b:BÀI KIỂM TRA THỬ}¶MÔN: TIẾNG ANH – LỚP 3')) @{ vien = $false }
    Doan '{b:I. Vocabulary}' | Out-Null
    Doan '{b:1. Look and CIRCLE the correct answer. There is one example.}    (………/ 2 points)' | Out-Null
    Bang @(
      @('0.', '/b/', 'A.', '{img:bag}', 'B.', '{img:cup}', 'C.', '{img:dog}'),
      @('1.', '/c/', 'A.', '{img:bed}', 'B.', '{img:cake}', 'C.', '{img:bus}'),
      @('2.', '/d/', 'A.', '{img:duck}', 'B.', '{img:car}', 'C.', '{img:fish}')
    )
    Doan '{b:2. Read and WRITE the correct LETTERS in the blank. There is an extra answer.}' | Out-Null
    Doan "`t`t`t`t`t(………/ 2 points)" | Out-Null
    Bang @(
      @('A. on', 'C. under', 'E. big'),
      @('B. in', 'D. small', ''),
      @('0.', 'The cat is ___ the box. (B)', ''),
      @('3.', 'The book is ______ the bag.', ''),
      @('4.', 'My bag is very ______.', '')
    )
    Doan '{b:II. Reading}' | Out-Null
    Doan '{b:3. Read. CIRCLE the correct answer. There is one example.}  (………/ 2 points)' | Out-Null
    Bang @(, @(, @('{b:My pet}', 'I have a __(0)__ cat. Her name (5) ______ Kitty. She likes (6) ______ fish.', @{ bang = @(@('0.', 'A. small', 'B. smalls', 'C. smaller'), @('5.', 'A. are', 'B. is', 'C. am'), @('6.', 'A. eat', 'B. eats', 'C. eating')); vien = $false })))
    Doan '{b:4. Look and read. CIRCLE YES or NO. There is one example.} (………/ 2 points)' | Out-Null
    Doan '  0.  Kitty is a dog.                         A. Yes     B. No' | Out-Null
    Bang @(@('7. Kitty is a cat.', 'A. Yes', 'B. No'), @('8. Kitty likes milk.', 'A. Yes', 'B. No'))
    Doan '{b:III. Writing}' | Out-Null
    Doan '{b:5. Look. READ and WRITE the answer.} (………/ 2 points)' | Out-Null
    Bang @(
      @('9.', '{img:cat}', 'Where is the cat? (under)¶Answer: ____________________'),
      @('10.', '{img:fish}', 'What does she like? (fish)¶Answer: ____________________')
    )
    Doan 'The End!' | Out-Null
  }

  # ======================= word-tieu-hoc-key: bảng Item | Key + câu viết =======================
  TaiLieu 'word-tieu-hoc-key' {
    Bang @(, @('{img:logo}', '{b:ĐÁP ÁN}¶BÀI KIỂM TRA THỬ – TIẾNG ANH LỚP 3')) @{ vien = $false }
    Doan '' | Out-Null
    Bang @(
      @('Item', 'Key', 'Item', 'Key'),
      @('1', 'B - 3.0.TA.1.2', '5', 'B - 3.0.TA.3.1'),
      @('2', 'A - 3.0.TA.1.4', '6', 'C - 3.0.TA.3.1'),
      @('3', 'B - 3.0.TA.2.7', '7', 'YES'),
      @('4', 'E - 3.0.TA.2.7', '8', 'NO')
    )
    Doan '' | Out-Null
    Doan 'Câu 9 - 10:' | Out-Null
    Doan 'Mỗi câu trả lời đúng, thành câu hoàn chỉnh: 1 điểm' | Out-Null
    Doan "9. It’s under the table." | Out-Null   # ’ là dấu nháy đơn với PowerShell → để trong nháy kép
    Doan '10. She likes fish.' | Out-Null
  }

  # ======================= word-tieng-anh: đề đánh số "1." (không bảng) =======================
  TaiLieu 'word-tieng-anh' {
    Bang @(, @('{img:logo}', '{b:BÀI KIỂM TRA THỬ}¶MÔN: TIẾNG ANH – LỚP 4')) @{ vien = $false }
    Doan '{b:I. Phonetics}' | Out-Null
    Doan '{b:1. Which word has a different sound? CHOOSE the correct answer.}' | Out-Null
    Doan "There is one example.`t`t`t(…………/2 points)" | Out-Null
    Doan "0. A. b{u:oo}k`t`tB. l{u:oo}k`t`tC. f{u:oo}d`t`tD. c{u:oo}k" | Out-Null
    Doan "1. A. play{u:ed}`t`tB. watch{u:ed}`t`tC. cook{u:ed}`t`tD. jump{u:ed}" | Out-Null
    Doan "2. A. {u:th}ink`t`tB. {u:th}is`t`tC. {u:th}ree`t`tD. {u:th}ank" | Out-Null
    Doan '{b:II. Vocabulary and grammar}' | Out-Null
    Doan "{b:2. Read and choose the correct word from the box.}`t(…………/2 points)" | Out-Null
    Bang @(, @('river', 'forest', 'desert'))
    Doan '' | Out-Null   # hai bảng liền nhau Word tự nối thành một → cách bằng một đoạn trống
    Bang @(@('0. A hot, dry place with a lot of sand.', '……………………'), @('3. A large area full of trees.', '……………………'), @('4. Water that flows to the sea.', '……………………'))
    Doan '{b:B. GRAMMAR}' | Out-Null
    $tieuDe = Doan '{b:CHOOSE the best answer.}   (…………/1 point)'
    DanhSo $tieuDe $tieuDe (MauDS '%1.' 0 3)
    Doan '5. She ……………… to school every day.' | Out-Null
    Doan "A. go`t`tB. goes`t`tC. going`t`tD. gone" | Out-Null
    Doan "{b:4. Find the mistakes.}`t`t(…………/1 point)" | Out-Null
    Doan "6. He {u:don’t} like {u:apples} {u:because} they {u:are} sour.`t……………" | Out-Null
    Doan "          A`t`t   B`t`t  C`t`t  D" | Out-Null
    Doan '{b:III. Reading}' | Out-Null
    Doan "{b:5. Read the text. CHOOSE the correct answer.}`t(…………/2 points)" | Out-Null
    Doan 'Tom lives near the sea. Every morning he (7) ……………… to the beach and (8) ……………… for shells.' | Out-Null
    Doan "7. A. walk`t`tB. walks`t`tC. walking`t`tD. walked" | Out-Null
    Doan "8. A. look`t`tB. looks`t`tC. looking`t`tD. looked" | Out-Null
    Doan 'The end -' | Out-Null
  }

  TaiLieu 'word-tieng-anh-key' {
    Bang @(, @('{img:logo}', '{b:ĐÁP ÁN}¶BÀI KIỂM TRA THỬ – TIẾNG ANH LỚP 4')) @{ vien = $false }
    Doan '' | Out-Null
    Bang @(
      @('Item', 'Key', 'Item', 'Key'),
      @('1', 'A - 4.0.TA.1.3', '5', 'B - 4.0.TA.3.5'),
      @('2', 'B - 4.0.TA.1.1', '6', 'A - 4.0.TA.3.5'),
      @('3', 'Forest - 4.0.TA.2.36', '7', 'B - 4.0.TA.4.12'),
      @('4', 'River - 4.0.TA.2.36', '8', 'B - 4.0.TA.4.12')
    )
  }

  # ======================= word-upload: mẫu upload câu hỏi =======================
  TaiLieu 'word-upload' {
    Doans @(
      'Câu 1 [TF-NB]: Is the sky blue on a clear day?',
      'A) Yes',
      'B) No',
      'ANSWER: A,B=-10',
      'Câu 2 [OC-TH] : Thủ đô của Nhật Bản là',
      'A) Tokyo',
      'B)  Osaka',
      'C) Kyoto',
      'D) Nagoya',
      'ANSWER: A, B=-10 ,C=-10, D=-10',
      'Câu 3 [FB-H] :',
      'Mặt trời mọc ở hướng [[1]],',
      'lặn ở hướng [[2]].',
      '[[1]] = 50',
      'A) đông',
      'B) tây',
      'ANSWER: A=100,B=-10',
      '[[2]]=50',
      'A) tây',
      'Câu 4 [SDL-VD]: Phương trình ⟦x^2-4=0⟧ có bao nhiêu nghiệm thực? [[1]]',
      '[[1]]',
      'A) hai',
      'B) một',
      'C) không có',
      'ANSWER: A,B=-20',
      'Câu 5 [MC-VD] : Chọn các số nguyên tố.',
      'A) 2',
      'B) 3',
      'C) 4',
      'D) 9',
      'ANSWER: A=50, B=50, C=-50,D=-50',
      'Câu 6 [ES-VDC]: Nêu hai lợi ích của việc đọc sách.',
      'ANSWER: ',
      '- Mở rộng hiểu biết.',
      '- Rèn khả năng tập trung.',
      'Câu 7 [EM-NB]: Đọc thông tin sau và trả lời các câu hỏi:',
      'Lan có 3 quả táo và 2 quả cam.',
      '[OC]: Lan có bao nhiêu quả táo?',
      'A) 2',
      'B) 3',
      'ANSWER: B',
      ' [FB]: Lan có tất cả [[3]] quả.',
      '[[3]] = 100',
      'A) 5',
      '[ES] : Em thích loại quả nào? Vì sao?',
      'ANSWER: ',
      'Học sinh tự trả lời, nêu được lí do.'
    )
  }

  # ======================= word-danh-so: mẫu NGÂN HÀNG, Word tự đánh số câu và phương án =======================
  TaiLieu 'word-danh-so' {
    $ltCau = MauDS 'Câu %1.' 0 1
    $st = $script:D.Styles.Add('CauHoi', 1)
    $ltCau.ListLevels.Item(1).LinkedStyle = 'CauHoi'
    function Cau([string]$s) { $p = Doan $s; $script:D.Range($p.s, $p.e - 1).Style = 'CauHoi'; return $p }
    Doan 'NGÂN HÀNG: Thử Word tự đánh số' | Out-Null
    Cau 'Thủ đô của Pháp là' | Out-Null
    CacPA (MauDS '%1.' 3) @('{red:Paris}', 'Lyon', 'Nice', 'Marseille')
    Cau 'Giá trị của ⟦√16⟧ là' | Out-Null
    CacPA (MauDS '%1.' 3) @('2', '{hl:4}', '8', '16')
    Cau 'Đẳng thức nào luôn đúng?' | Out-Null
    CacPA (MauDS '%1.' 3) @('⟦(a+b)^2=a^2+2ab+b^2⟧', '⟦(a-b)^2=a^2-b^2⟧', '⟦a^2+b^2=(a+b)^2⟧')
    Doan 'Đáp án: A' | Out-Null
    Cau 'Xét tính đúng sai của các mệnh đề sau:' | Out-Null
    CacPA (MauDS '%1)' 4) @('2 là số nguyên tố.', '9 là số nguyên tố.', '⟦√2⟧ là số vô tỉ.')
    Doan 'Đáp án: ĐSĐ' | Out-Null
  }
} finally {
  if ($script:W) {
    foreach ($x in @($script:W.Documents)) { try { $x.Close([ref]0) } catch {} }
    try { $script:W.Quit([ref]0) } catch { Buoc ('Quit lỗi: ' + $_.Exception.Message) }
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($script:W) } catch {}
    $script:W = $null
  }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

# ======================= xoá tên tác giả, chép vào tests/fixtures/docx =======================
$js = @'
const zip = require(process.argv[2]); const fs = require('fs'); const path = require('path');
const [, , , tam, dich, ...ten] = process.argv;
(async () => {
  for (const t of ten) {
    const p = path.join(tam, t + '.docx');
    if (!fs.existsSync(p)) continue;
    const z = await zip.readZip(fs.readFileSync(p));
    const files = Object.keys(z).map((k) => {
      let d = z[k];
      if (k === 'docProps/core.xml') {
        d = Buffer.from(d).toString().replace(/<dc:creator>[^<]*<\/dc:creator>/, '<dc:creator></dc:creator>')
          .replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy></cp:lastModifiedBy>');
      }
      return { path: k, data: d };
    });
    fs.writeFileSync(path.join(dich, t + '.docx'), await zip.writeZip(files, { date: new Date(2026, 9, 2) }));
    console.log('  ghi ' + t + '.docx');
  }
})();
'@
$f = Join-Path $tam 'xoa-ten.cjs'
[IO.File]::WriteAllText($f, $js, (New-Object Text.UTF8Encoding $false))
& node $f (Join-Path $goc 'js\zip.js') $tam $dir @($daTao)
if ($LASTEXITCODE) { throw ('node lỗi ' + $LASTEXITCODE) }
Remove-Item -Recurse -Force $tam -Confirm:$false -ErrorAction SilentlyContinue
Buoc ('Đã tạo: ' + ($daTao -join ', '))
