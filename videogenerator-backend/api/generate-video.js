// File: /api/generate-video.js
// Vercel Serverless Function untuk memproses video dan berinteraksi dengan API
// Menggunakan Express, Multer, dan CORS

// Impor modul yang dibutuhkan
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // node-fetch diperlukan untuk beberapa versi Node.js

// Konfigurasi Multer untuk mengelola unggahan file
const upload = multer({ dest: '/tmp/' }); // Vercel hanya mengizinkan penulisan ke folder /tmp

// Inisialisasi Express app
const app = express();

// Middleware untuk mengaktifkan CORS (Cross-Origin Resource Sharing)
// Ini penting agar frontend Anda bisa berkomunikasi dengan backend Vercel.
app.use(cors());

// ========================================================================
// Catatan Penting:
//
// Untuk keamanan, API Key harus disimpan sebagai Environment Variables di Vercel.
// Jangan hardcode di sini!
// ========================================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Buat endpoint POST untuk memproses video
app.post('/', upload.single('photo'), async (req, res) => {
  try {
    // 1. Validasi input
    if (!req.file) {
      return res.status(400).json({ error: 'File foto tidak ditemukan.' });
    }
    const { videoChoice, musicChoice } = req.body;
    if (!videoChoice || !musicChoice) {
      fs.unlinkSync(req.file.path); 
      return res.status(400).json({ error: 'Pilihan video dan musik harus diisi.' });
    }

    // Ubah foto menjadi Base64
    const photoPath = req.file.path;
    const photoBuffer = fs.readFileSync(photoPath);
    const base64ImageData = photoBuffer.toString('base64');
    
    console.log('Backend menerima foto dan pilihan...');

    // 2. Analisis gambar dengan Gemini API
    const prompt = `Analisis gambar ini dan berikan judul, deskripsi singkat, dan 5-10 tag dalam format JSON.
    Judul harus menarik, deskripsi harus ringkas, dan tag harus relevan.
    Format JSON: {"title": "Judul", "description": "Deskripsi", "tags": ["tag1", "tag2", "tag3"]}`;

    const geminiPayload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: req.file.mimetype,
                data: base64ImageData
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            "title": { "type": "STRING" },
            "description": { "type": "STRING" },
            "tags": {
              "type": "ARRAY",
              "items": { "type": "STRING" }
            }
          },
          "propertyOrdering": ["title", "description", "tags"]
        }
      }
    };
    
    console.log('Memanggil Gemini API untuk menganalisis gambar...');
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload)
    });

    if (!geminiResponse.ok) {
      throw new Error(`Gemini API request failed with status: ${geminiResponse.status}`);
    }

    const geminiResult = await geminiResponse.json();
    const jsonText = geminiResult?.candidates?.[0]?.content?.parts?.[0]?.text;
    const { title, description, tags } = JSON.parse(jsonText);

    // 3. (SIMULASI) Pemrosesan video menggunakan FFmpeg
    // Di lingkungan serverless, Anda akan menjalankan proses ini
    // sebagai bagian dari fungsi ini.
    console.log('Simulasi pemrosesan video selesai.');

    // 4. Kirim hasil ke Telegram Bot API
    const messageText = `Video baru telah dibuat!\n\nJudul: ${title}\nDeskripsi: ${description}\nTags: ${tags.join(', ')}`;
    
    console.log('Mengirim pesan ke Telegram...');
    
    const telegramTextResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: messageText
      })
    });

    if (!telegramTextResponse.ok) {
        throw new Error(`Telegram sendMessage API request failed with status: ${telegramTextResponse.status}`);
    }

    // 5. Beri tahu frontend bahwa proses berhasil
    res.status(200).json({
      message: 'Video berhasil diproses dan dikirim ke Telegram!',
      result: { title, description, tags }
    });

  } catch (error) {
    console.error('Terjadi kesalahan:', error);
    res.status(500).json({ error: 'Terjadi kesalahan saat memproses permintaan.' });
  } finally {
    // Hapus file yang diunggah setelah selesai
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Gagal menghapus file yang diunggah:', err);
      });
    }
  }
});

// Vercel mengekspor handler sebagai fungsi.
// Anda dapat mengonfigurasi ini di vercel.json.
// Cara paling sederhana, ekspos app sebagai handler.
// app.all('*', (req, res) => handler(req, res));
module.exports = app;
