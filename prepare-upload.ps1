# Kimp Fun - cPanel Upload Package Creator
# Run this script in PowerShell to create a ZIP file ready for cPanel upload

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Kimp Fun - cPanel Upload Prep  " -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

$sourceDir = "d:\jsgame"
$outputZip = "d:\kimp-fun-upload.zip"

# Files to include
$filesToInclude = @(
    ".htaccess",
    "server.js",
    "package.json",
    "README.md",
    "CPANEL-DEPLOYMENT.md",
    "CPANEL-CHECKLIST.md",
    "public\index.html",
    "public\app.js",
    "public\styles.css"
)

Write-Host "Checking files..." -ForegroundColor Yellow

$missingFiles = @()
foreach ($file in $filesToInclude) {
    $fullPath = Join-Path $sourceDir $file
    if (Test-Path $fullPath) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file (MISSING!)" -ForegroundColor Red
        $missingFiles += $file
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "ERROR: Missing files! Cannot create upload package." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Creating upload package..." -ForegroundColor Yellow

# Remove old zip if exists
if (Test-Path $outputZip) {
    Remove-Item $outputZip -Force
    Write-Host "  Removed old ZIP file" -ForegroundColor Gray
}

# Create temporary directory for clean packaging
$tempDir = Join-Path $env:TEMP "kimp-fun-temp"
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

# Copy files
foreach ($file in $filesToInclude) {
    $sourcePath = Join-Path $sourceDir $file
    $destPath = Join-Path $tempDir $file
    
    # Create directory if needed
    $destDir = Split-Path $destPath -Parent
    if (!(Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    
    Copy-Item $sourcePath $destPath -Force
}

# Create ZIP
Compress-Archive -Path "$tempDir\*" -DestinationPath $outputZip -Force

# Cleanup temp
Remove-Item $tempDir -Recurse -Force

Write-Host ""
Write-Host "==================================" -ForegroundColor Green
Write-Host "  Package Created Successfully!   " -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Green
Write-Host ""
Write-Host "Upload package saved to:" -ForegroundColor Cyan
Write-Host "  $outputZip" -ForegroundColor White
Write-Host ""
Write-Host "File size: $([math]::Round((Get-Item $outputZip).Length / 1KB, 2)) KB" -ForegroundColor Gray
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Log into your cPanel" -ForegroundColor White
Write-Host "  2. Open File Manager" -ForegroundColor White
Write-Host "  3. Navigate to public_html/" -ForegroundColor White
Write-Host "  4. Upload kimp-fun-upload.zip" -ForegroundColor White
Write-Host "  5. Extract the ZIP file" -ForegroundColor White
Write-Host "  6. Follow CPANEL-CHECKLIST.md" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to open the upload folder..." -ForegroundColor Cyan
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Open folder
Start-Process "explorer.exe" -ArgumentList "/select,`"$outputZip`""
