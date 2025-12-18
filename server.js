// server.js
const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000

// ---- Multer config (temp uploads) ----
const upload = multer({ dest: 'uploads/' });

const processfiles = require('./controller')
const processSubtitleFile = require('./subtitleController')

// ---- Serve index.html on / ----
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---- Transform API ----
app.post(
  '/api/transform',
  upload.fields([
    { name: 'background', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
    { name: 'subtitle', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const { password, subtitleFormat } = req.body

      if (!password) {
        return res.status(400).json({ error: 'Password required' });
      }
      // else if (password != process.env.PASSWORD) {
      //   return res.status(400).json({ error: 'Password Incorrect' });
      // }

      const background = req.files.background?.[0];
      const audio = req.files.audio?.[0];
      const subtitle = req.files.subtitle?.[0];

      if (!background || !audio || !subtitle) {
        return res.status(400).json({ error: 'Missing files' });
      }
      
      let processedSubtitlePath = subtitle?.path 
      if (subtitleFormat == 'txt') {
        processedSubtitlePath = processSubtitleFile(subtitle?.path)
      }
      // process and return output path
      let outputPath = await processfiles(background?.path, audio?.path, processedSubtitlePath)

      // ---- Simulate processing ----
      // const outputPath = path.join(__dirname, 'output.mp4');
      // const outputContent = `Transform completed!\n\nFiles received:\n- ${background.originalname}\n- ${audio.originalname}\n- ${subtitle.originalname}\nPassword: ${password}`;

      // fs.writeFileSync(outputPath, outputContent);

      // ---- Send file response ----
      res.download(outputPath, 'video.mp4', () => {
        // Cleanup temp files
        fs.unlinkSync(background.path);
        fs.unlinkSync(audio.path);
        fs.unlinkSync(subtitle.path);
        fs.unlinkSync(outputPath);
      });
    } catch (err) {
      console.error(err);
      try {
        background?.path && fs.unlinkSync(background.path)
        audio?.path && fs.unlinkSync(audio.path)
        subtitle?.path && fs.unlinkSync(subtitle.path)
        outputPath && fs.unlinkSync(outputPath)
      } catch (err) { console.log('all - paths not cleared', err.message)}

      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});