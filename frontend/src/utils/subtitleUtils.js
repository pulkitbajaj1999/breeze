/**
 * Subtitle conversion utilities for FFmpeg video generation
 */


/**
 * Converts SRT subtitle format to ASS (Advanced SubStation Alpha) format with fade transitions
 * @param {File|string} fileOrUrl - File object (from upload) or URL string (for sample files)
 * @param {string} fontName - Font name to use in ASS header (must match font metadata)
 * @param {number} fadeMs - Fade duration in milliseconds (default: 300)
 * @returns {Promise<string>} ASS formatted subtitle string
 */
export const convertSrtToAssWithTransitions = async (
  fileOrUrl,
  fontName,
  fadeMs = 1200
) => {
  // Handle both standard File objects (uploads) and strings (sample URLs)
  let text = '';
  if (typeof fileOrUrl === 'string') {
    const res = await fetch(fileOrUrl);
    text = await res.text();
  } else {
    text = await fileOrUrl.text();
  }

  // ASS Header (We define the font and layout here)
  let ass = `[Script Info]
      ScriptType: v4.00+
      PlayResX: 1280
      PlayResY: 720

      [V4+ Styles]
      Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
      Style: Default,${fontName},48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,5,10,10,0,1

      [Events]
      Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

  // Parse SRT and convert timings
  const blocks = text.trim().split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const times = lines[1].split(' --> ');
      if (times.length === 2) {
        // Convert SRT time (00:00:03,500) to ASS time (0:00:03.50)
        const formatTime = (t) => {
          const [hms, ms] = t.split(',');
          return `${hms.startsWith('0') ? hms.substring(1) : hms}.${ms.substring(0, 2)}`;
        };

        const start = formatTime(times[0].trim());
        const end = formatTime(times[1].trim());
        const dialogue = lines.slice(2).join('\\N');

        // \fad(fadeMs,fadeMs) creates a fade-in and fade-out for every subtitle
        ass += `Dialogue: 0,${start},${end},Default,,0,0,0,,{\\fad(${fadeMs},${fadeMs})}${dialogue}\n`;
      }
    }
  }
  return ass;
};

/**
 * Formats time from SRT format (HH:MM:SS,mmm) to ASS format (H:MM:SS.mm)
 * @param {string} srtTime - Time in SRT format
 * @returns {string} Time in ASS format
 */
export const formatSrtTimeToAss = (srtTime) => {
  const [hms, ms] = srtTime.split(',');
  return `${hms.startsWith('0') ? hms.substring(1) : hms}.${ms.substring(0, 2)}`;
};

/**
 * Generates ASS header with specified font and dimensions
 * @param {string} fontName - Font name for subtitles
 * @param {number} width - Video width in pixels (default: 1280)
 * @param {number} height - Video height in pixels (default: 720)
 * @returns {string} ASS header string
 */
export const generateAssHeader = (fontName, width = 1280, height = 720) => {
  return `[Script Info]
      ScriptType: v4.00+
      PlayResX: ${width}
      PlayResY: ${height}

      [V4+ Styles]
      Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
      Style: Default,${fontName},48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,2,10,10,50,1

      [Events]
      Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
};

/**
 * Converts custom timestamp format subtitles to ASS format
 * Input format: MM:SS on one line, text on next line(s), blank line separator
 * Example:
 * 00:03
 * Kuch paa kar khona hai
 * 
 * 00:12
 * Jeevan ka matlab
 * 
 * @param {string} text - Raw subtitle text in custom format
 * @param {string} fontName - Font name to use in ASS header
 * @param {number} defaultDurationMs - Default subtitle duration in ms (default: 5000)
 * @param {number} fadeMs - Fade transition duration in ms (default: 300)
 * @returns {Promise<string>} ASS formatted subtitle string
 */
export const convertCustomTimestampToAss = async (
  text,
  fontName,
  defaultDurationMs = 5000,
  fadeMs = 300
) => {
  // Parse timestamps and text blocks
  const blocks = text.trim().split(/\n\s*\n/); // Split by blank lines
  const subtitles = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length >= 1) {
      const timestampLine = lines[0].trim();
      // Match MM:SS or HH:MM:SS format
      const timeMatch = timestampLine.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      
      if (timeMatch) {
        let totalSeconds = 0;
        if (timeMatch[3]) {
          // HH:MM:SS format
          totalSeconds = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
        } else {
          // MM:SS format
          totalSeconds = parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
        }
        
        const text = lines.slice(1).join('\\N').trim();
        if (text) {
          subtitles.push({ startTime: totalSeconds, text });
        }
      }
    }
  }

  // Generate ASS content
  let ass = generateAssHeader(fontName);

  for (let i = 0; i < subtitles.length; i++) {
    const current = subtitles[i];
    
    // Calculate end time: either next subtitle start or current + default duration
    let endTime;
    if (i < subtitles.length - 1) {
      endTime = subtitles[i + 1].startTime;
    } else {
      endTime = current.startTime + defaultDurationMs / 1000;
    }

    // Convert seconds to ASS time format (H:MM:SS.cc)
    const formatAssTime = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const centisecs = Math.floor((seconds % 1) * 100);
      
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centisecs).padStart(2, '0')}`;
    };

    const startAss = formatAssTime(current.startTime);
    const endAss = formatAssTime(endTime);

    ass += `Dialogue: 0,${startAss},${endAss},Default,,0,0,0,,{\\fad(${fadeMs},${fadeMs})}${current.text}\n`;
  }

  return ass;
};
