@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Abrindo o app em http://localhost:8101  (feche esta janela para desligar)
start "" http://localhost:8101
python -m http.server 8101
