# PowerShell script to run both Frontend (Jest) and Android App (Gradle) Unit Tests
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "1/2 Running Frontend (Jest) Unit Tests..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Push-Location webapp
try {
    npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n❌ Frontend (Jest) Unit Tests Failed!" -ForegroundColor Red
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "2/2 Running Android App (Gradle) Unit Tests..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Push-Location expenseiq-android-app
try {
    if ($IsWindows -or $env:OS -like "*Windows*") {
        .\gradlew.bat test
    } else {
        ./gradlew test
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n❌ Android App (Gradle) Unit Tests Failed!" -ForegroundColor Red
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "✅ SUCCESS: All Frontend & Android Unit Tests Passed!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
