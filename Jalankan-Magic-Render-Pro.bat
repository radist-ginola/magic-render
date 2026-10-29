@echo off
setlocal EnableExtensions
cd /d "%~dp0" || goto :failed
title Magic Render Pro - Development Launcher

where node >nul 2>nul || (echo Node.js 22+ tidak ditemukan. Pasang Node.js terlebih dahulu.& goto :failed)
where npm >nul 2>nul || (echo npm tidak ditemukan. Periksa instalasi Node.js.& goto :failed)

if not exist "node_modules" (
  echo [1/2] Menginstal dependensi dari package-lock.json...
  call npm ci || goto :failed
) else (
  echo Dependensi sudah tersedia. Lewati npm ci.
)

echo [2/2] Menjalankan mode pengembangan...
call npm run dev || goto :failed
exit /b 0

:failed
echo.
echo Perintah gagal. Periksa pesan di atas.
pause
exit /b 1
