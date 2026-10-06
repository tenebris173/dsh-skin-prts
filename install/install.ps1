<#
  PRTS · UI 美化包 —— 安装脚本

  做两件事：
    1) 把 packages\*.tgz 装进 DSH 的 desktop profile（用应用自带的 desktop CLI，不手改 node_modules）
    2) 默认把「PRTS」设为当前皮肤（-NoActivate 可跳过；也可装完在 设置 → 皮肤 里点）

  用法：
    powershell -ExecutionPolicy Bypass -File .\install.ps1
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -DryRun        # 只看会做什么
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -NoActivate    # 装但不切换

  说明：
    - 优先使用**正在运行的**那个 DSH（你正在用的就是它）；没在运行则按常见安装路径找。
    - profile 固定为 ~/.dsh/profiles/desktop（桌面版皮肤都装在这里）。
    - 皮肤是**新增插件包**，装完必须重启 DSH 才会加载；脚本不会替你关应用。
#>
[CmdletBinding()]
param(
  [switch]$NoActivate,
  [switch]$DryRun
)

$ErrorActionPreference = 'Continue'
function Say([string]$m) { Write-Host $m }
function Ok([string]$m) { Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "  [!]  $m" -ForegroundColor Yellow }
function Fail([string]$m) { Write-Host "  [X]  $m" -ForegroundColor Red; exit 1 }

$Root    = Split-Path -Parent $MyInvocation.MyCommand.Path
$SkinId  = 'skins.prts'
$PkgName = 'dsh-skin-prts'
$ProfileName = 'desktop'

Say ''
Say '=== PRTS · UI 美化包 安装 ==='
Say ''

# ---------- 1. 包体：美化包模式（packages\*.tgz）或仓库模式（上级目录即皮肤包） ----------
$Tarball = Get-ChildItem (Join-Path $Root 'packages') -Filter '*.tgz' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($Tarball) {
  $Source = $Tarball.FullName
  Ok ('包体 ' + $Tarball.Name + '  ' + [math]::Round($Tarball.Length / 1KB, 1) + ' KB')
} else {
  $repo = Split-Path -Parent $Root
  if (-not (Test-Path (Join-Path $repo 'package.json'))) { Fail '找不到 packages\*.tgz，且上级目录也不是皮肤包' }
  $Source = $repo
  Ok ('源码目录 ' + $repo + '（软链安装，改代码刷新即生效）')
}

# ---------- 2. 找应用：正在运行的优先 ----------
$AppDir = $null; $Exe = $null; $Cli = $null

function Resolve-Cli([string]$dir) {
  $plain = Join-Path $dir 'resources\app\lib\desktop-cli.js'
  if (Test-Path $plain) { return $plain }
  $asar = Join-Path $dir 'resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js'
  # app.asar 是归档文件，Test-Path 看不进内部；只要它在，路径就交给 Electron 去读
  if (Test-Path (Join-Path $dir 'resources\app.asar')) { return $asar }
  return $null
}

$running = @(Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -in @('DeepSeek Harness', 'DSH NEXT') -and $_.Path } |
  Select-Object -ExpandProperty Path -Unique)
foreach ($path in $running) {
  $dir = Split-Path -Parent $path
  $cli = Resolve-Cli $dir
  if ($cli) { $AppDir = $dir; $Exe = $path; $Cli = $cli; break }
}
if ($AppDir) { Ok ('应用（正在运行）' + $Exe) }

if (-not $AppDir) {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness'),
    'C:\Program Files\DeepSeek Harness',
    'C:\Program Files\DSH NEXT',
    'C:\Program Files (x86)\DeepSeek Harness'
  )
  foreach ($dir in $candidates) {
    if (-not (Test-Path $dir)) { continue }
    $exe = Get-ChildItem $dir -Filter '*.exe' -ErrorAction SilentlyContinue |
           Where-Object { $_.Name -in @('DeepSeek Harness.exe', 'DSH NEXT.exe') } | Select-Object -First 1
    if (-not $exe) { continue }
    $cli = Resolve-Cli $dir
    if (-not $cli) { continue }
    $AppDir = $dir; $Exe = $exe.FullName; $Cli = $cli; break
  }
  if ($AppDir) { Ok ('应用 ' + $Exe) }
}
if (-not $AppDir) { Fail '找不到 DSH 安装目录；可手动执行：dsh plugin --profile desktop add <tgz 路径>' }
Ok ('CLI  ' + $Cli)

# ---------- 3. 提醒 ----------
$stillRunning = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -like "$AppDir*" })
if ($stillRunning.Count -gt 0) {
  Warn ('DSH 正在运行（PID ' + (($stillRunning | ForEach-Object { $_.Id }) -join ', ') + '）—— 安装可以进行，但必须重启后皮肤才会加载。')
}

# ---------- 3.5 前置检查：皮肤加载器（缺了皮肤不会生效） ----------
$LoaderPath = Join-Path $env:USERPROFILE ".dsh\profiles\$ProfileName\node_modules\@dsh-eac\ui-skin-loader"
if (Test-Path $LoaderPath) {
  Ok '皮肤加载器已安装（@dsh-eac/ui-skin-loader）'
} else {
  Warn '未检测到皮肤加载器 @dsh-eac/ui-skin-loader —— 本皮肤不会生效！'
  Warn '  它提供「设置 → 皮肤」页面与皮肤登记服务（第三方插件，不随本包分发）。'
  Warn '  请先安装加载器，再重启 DSH；装好后设置里会出现「皮肤」页面。'
  Warn '  安装照旧继续，加载器补装后本皮肤即可正常使用。'
}

if ($DryRun) {
  Say ''
  Say '  -DryRun：不会写任何东西。实际会执行：'
  Say ('    "' + $Exe + '" "' + $Cli + '" plugin --profile ' + $ProfileName + ' add "' + $Source + '"')
  if (-not $NoActivate) { Say ('    并把 activeSkin 设为 ' + $SkinId) }
  Say ''
  exit 0
}

# ---------- 4. 安装 ----------
$env:ELECTRON_RUN_AS_NODE = '1'
Say ''
Say ('[1/3] 装进 ' + $ProfileName + ' profile ...')
$install = (& $Exe $Cli plugin --profile $ProfileName add $Source 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or $install -match 'ERR_|failed') { Write-Host $install; Fail '安装失败（把上面的输出发我）' }
Ok '已注册为 profile 依赖'

Say '[2/3] 核对安装结果 ...'
$list = (& $Exe $Cli plugin --profile $ProfileName list 2>&1 | Out-String)
if ($list -notmatch [regex]::Escape($PkgName)) { Write-Host $list; Fail '列表里没看到该包' }
Ok ($PkgName + ' 已在安装列表')

# ---------- 5. 切到PRTS ----------
$profilePatch = Join-Path $env:USERPROFILE ".dsh\profiles\$ProfileName\cordis.patch.yml"
if (-not $NoActivate) {
  Say '[3/3] 设为当前皮肤 ...'
  if (-not (Test-Path $profilePatch)) {
    Warn ('找不到 ' + $profilePatch + '，跳过；请到 设置 → 皮肤 里点「PRTS」')
  } else {
    Copy-Item $profilePatch ($profilePatch + '.bak-prts-install') -Force
    $text = Get-Content $profilePatch -Raw -Encoding UTF8
    $new  = [regex]::Replace($text, '(?m)^(\s*activeSkin:\s*).*$', ('${1}' + $SkinId))
    if ($new -eq $text -and $text -notmatch 'activeSkin:') {
      $new = $text.TrimEnd() + "`n- id: dsh-ui-skin-loader`n  name: `"@dsh-eac/ui-skin-loader`"`n  config:`n    activeSkin: " + $SkinId + "`n"
    }
    Set-Content -Path $profilePatch -Value $new -Encoding UTF8 -NoNewline
    Ok ('activeSkin -> ' + $SkinId + '（原文件已备份为 cordis.patch.yml.bak-prts-install）')
  }
} else {
  Say '[3/3] 跳过切换（-NoActivate）—— 重启后到 设置 → 皮肤 点「PRTS」即可'
}

Say ''
Say '=== 装好了 ==='
Say '  1) 完全退出并重新打开 DSH（新增插件包必须重启）'
Say '  2) 界面即为PRTS；设置 → 皮肤 里能看到「PRTS」卡片，可一键切回其它皮肤'
Say '  3) 外观面板：底色 / 强调色 / 圆角密度 / 背景极光 / 胶片颗粒'
Say ''
