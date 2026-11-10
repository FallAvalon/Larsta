@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.13+ or Node.js 24 LTS, then run this file again.
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22 || a===22&&b>=13 ? 0 : 1)"
if errorlevel 1 (
  echo Node.js 22.13+ is required. Node.js 24 LTS is recommended.
  pause
  exit /b 1
)
if not exist "node_modules\.bin\vite.cmd" (
  call npm.cmd ci --include=dev --no-fund --no-audit --cache "%TEMP%\larsta-npm-cache"
  if errorlevel 1 goto failed
)
call npm.cmd run build
if errorlevel 1 goto failed
call npm.cmd start
if errorlevel 1 goto failed
exit /b 0
:failed
echo Larsta could not start. Check the error above.
pause
exit /b 1
