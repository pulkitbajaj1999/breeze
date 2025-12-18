const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

async function process(backgroundPath, audioPath, subtitlePath) {
  let outputPath = 'output.mp4'
  return new Promise((resolve, reject) => {
    ffmpeg()
    // 1. Input Image with Loop
    .input(backgroundPath)
    .inputOptions(['-loop 1', '-framerate 15'])
    
    // 2. Input Audio
    .input(audioPath)
    
    // 3. Video Filter (Subtitles + Even Scaling)
    .videoFilters([
      `ass=${subtitlePath}:fontsdir=fonts`,
      'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      // 'scale=-2:480'
    ])
    
    // 4. Video Settings
    .videoCodec('libx264')
    .outputOptions([
      '-preset veryfast',
      '-tune stillimage', // major CPU saver
      '-crf 30',
      '-threads 1',
      '-pix_fmt yuv420p',
      '-shortest',
      '-movflags +faststart'
    ])
  
    
    // 5. Audio Settings
    .audioCodec('copy')
    
    // 6. Execution
    .on('start', (commandLine) => {
      console.log('Spawned FFmpeg with command: ' + commandLine);
    })
    .on('stderr', (stderrLine) => {
      // This prints the actual FFmpeg console output line-by-line
      console.log('FFmpeg Output: ' + stderrLine);
    })
    .on('error', (err) => {
      console.error('Error: ' + err.message);
    })
    .on('end', () => {
      console.log('Processing finished !');
      resolve(outputPath)
    })
    .save(outputPath);
  })
}

module.exports = process