Windows x64 runtime untuk installer Magic Render Pro.

Di mesin pembuat installer, `npm ci` mengambil paket build `ffmpeg-static` dan
`@derhuerst/ffprobe-static` (keduanya terkunci pada 5.3.0). `npm run dist`
menyalin binary Windows ke folder ini dan menguji versi, encoder H.264/AAC,
serta filter yang dipakai aplikasi sebelum electron-builder dijalankan.

Jika paket binary tidak dapat diunduh, tempatkan `ffmpeg.exe` dan `ffprobe.exe`
Windows x64 lengkap di sini. Keduanya harus bisa berjalan dan menyediakan
`libx264`, `aac`, `overlay`, `chromakey`, `drawtext`, dan `scale`.
Installer menyertakannya di `resources/ffmpeg/`; komputer tujuan tidak perlu
memasang FFmpeg sendiri. Jangan memakai binary dari platform/arsitektur lain.

Catat asal dan lisensi binary yang didistribusikan. Sumber FFmpeg dan panduan
distribusi tersedia di https://ffmpeg.org/download.html dan
https://ffmpeg.org/legal.html. Build dengan libx264 lazimnya melibatkan GPL;
pastikan distribusi installer memenuhi lisensi binary yang dipilih.
