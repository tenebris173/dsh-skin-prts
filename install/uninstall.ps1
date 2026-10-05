<#
  PRTS · UI 美化包 —— 卸载脚本
  移除插件，并把 activeSkin 还原为 default（原生观感）

  用法：
    powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
    powershell -ExecutionPolicy Bypass -File .\uninstall.ps1 -DryRun
#>
[CmdletBinding()]
param([switch]$DryRun)

$ErrorActionPreference = 'Continue'
function Ok([string]$m) { Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "  [!]  $m" -ForegroundColor Yellow }
function Fail([string]$m) { Write-Host "  [X]  $m" -ForegroundColor Red; exit 1 }

$PkgName = 'dsh-skin-prts'
$ProfileName = 'desktop'
Write-Host ''
Write-Host '=== PRTS · 卸载 ==='
Write-Host ''

$AppDir = $null; $Exe = $null; $Cli = $null

function Resolve-Cli([string]$dir) {
  $plain = Join-Path $dir 'resources\app\lib\desktop-cli.js'
  if (Test-Path $plain) { return $plain }
  $asar = Join-Path $dir 'resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js'
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
if (-not $AppDir) {
  foreach ($dir in @((Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness'), 'C:\Program Files\DeepSeek Harness', 'C:\Program Files\DSH NEXT')) {
    if (-not (Test-Path $dir)) { continue }
    $exe = Get-ChildItem $dir -Filter '*.exe' -ErrorAction SilentlyContinue |
           Where-Object { $_.Name -in @('DeepSeek Harness.exe', 'DSH NEXT.exe') } | Select-Object -First 1
    if (-not $exe) { continue }
    $cli = Resolve-Cli $dir
    if (-not $cli) { continue }
    $AppDir = $dir; $Exe = $exe.FullName; $Cli = $cli; break
  }
}
if (-not $AppDir) { Fail '找不到 DSH 安装目录' }
Ok ('应用 ' + $Exe)

if ($DryRun) {
  Write-Host ('  会执行： "' + $Exe + '" "' + $Cli + '" plugin --profile ' + $ProfileName + ' remove ' + $PkgName)
  Write-Host '  并把 activeSkin 还原为 default'
  exit 0
}

$stillRunning = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -like "$AppDir*" })
if ($stillRunning.Count -gt 0) { Warn 'DSH 正在运行 —— 卸载后需要重启才生效。' }

$env:ELECTRON_RUN_AS_NODE = '1'
Write-Host '[1/2] 移除插件 ...'
$out = (& $Exe $Cli plugin --profile $ProfileName remove $PkgName 2>&1 | Out-String)
Write-Host $out
if ($out -match 'not found|No package') { Warn '本来就没装（忽略即可）' } else { Ok '已移除' }

$profilePatch = Join-Path $env:USERPROFILE ".dsh\profiles\$ProfileName\cordis.patch.yml"
if (Test-Path $profilePatch) {
  Write-Host '[2/2] 还原 activeSkin ...'
  Copy-Item $profilePatch ($profilePatch + '.bak-prts-uninstall') -Force
  $text = Get-Content $profilePatch -Raw -Encoding UTF8
  $new  = [regex]::Replace($text, '(?m)^(\s*activeSkin:\s*).*$', '${1}default')
  Set-Content -Path $profilePatch -Value $new -Encoding UTF8 -NoNewline
  Ok 'activeSkin -> default（原生观感）'
}

Write-Host ''
Write-Host '=== 卸干净了，重启 DSH 即回到原生界面 ==='
Write-Host ''
