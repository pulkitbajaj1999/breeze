import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { convertCustomTimestampToAss, convertSrtToAssWithTransitions } from './utils/subtitleUtils';
import { BUILT_IN_FONTS } from './fonts'
import { FFMPEG_FOLDER_PATH } from './constants'
console.log('FFMPEG_FOLDER_PATH: ', FFMPEG_FOLDER_PATH)
/**
 * FFmpeg Video Creator (v0.12 API)
 * Joins Image + Audio + Subtitles with custom font support.
 */

const ASS_HEADER_MARKER = '[Script Info]';
const SAMPLE_OPTIONS = [
  { label: 'Choose sample', value: '' },
  { label: 'Sample 1', value: 'sample' }
];

export default function VideoGenerator() {
  const [loaded, setLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [renderTime, setRenderTime] = useState(null);
  const [renderMode, setRenderMode] = useState(null);
  const [selectedFontPath, setSelectedFontPath] = useState(BUILT_IN_FONTS[0].path);
  const [selectedSampleFolder, setSelectedSampleFolder] = useState('');

  const ffmpegRef = useRef(new FFmpeg());
  
  // Refs for file inputs
  const imageInput = useRef(null);
  const audioInput = useRef(null);
  const subtitleInput = useRef(null);

  // 1. Load the FFmpeg WASM Core
  useEffect(() => {
    loadFFmpeg();
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const loadFFmpeg = async () => {
    const ffmpeg = ffmpegRef.current;

    // Listen for progress updates from the engine
    ffmpeg.on('progress', ({ progress }) => {
      setProgress(Math.round(progress * 100));
    });

    ffmpeg.on('log', ({ message }) => {
      console.log('[fmpeg-message]:', message); // This will show libass errors if the font is missing
    });

    // Load the WASM files from the CDN
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${FFMPEG_FOLDER_PATH}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${FFMPEG_FOLDER_PATH}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${FFMPEG_FOLDER_PATH}/ffmpeg-core.worker.js`, 'text/javascript'),
      });
      console.log('ffmpeg loaded successfully...')
    }
    catch (err) {
      console.log('error: ffmpeg not laoded...', err)
      throw new Error(err)
    }
    setLoaded(true);
  };


  // NEW: Fetch files from /asset and inject them into the DOM inputs
  const loadSampleFilesForFolder = async (sampleFolder) => {
    setIsLoading(true);
    try {
      // Helper function to fetch a URL and convert it to a File object
      const fetchAsFile = async (url, filename, mimeType) => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`File not found at ${url}. Server returned ${response.status}`)
        }
        else {
          console.log(`[loadSampleFiles]: file found at ${url}`)
        }
        const blob = await response.blob();
        return new File([blob], filename, { type: mimeType });
      };

      const sampleBasePath = `/${sampleFolder}`;

      // 1. Fetch the files from the selected sample folder
      const imgFile = await fetchAsFile(`${sampleBasePath}/sample_image.jpeg`, 'sample_image.jpeg', 'image/jpeg');
      const audFile = await fetchAsFile(`${sampleBasePath}/sample_audio.mp3`, 'sample_audio.mp3', 'audio/mpeg');
      const subFile = await fetchAsFile(`${sampleBasePath}/sample_subtitle.srt`, 'sample_subtitle.srt', 'text/plain');
      // 2. Inject them into the DOM inputs using DataTransfer
      const imgDt = new DataTransfer();
      imgDt.items.add(imgFile);
      imageInput.current.files = imgDt.files;
      setImagePreviewUrl((currentUrl) => {
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl);
        }

        return URL.createObjectURL(imgFile);
      });

      const audDt = new DataTransfer();
      audDt.items.add(audFile);
      audioInput.current.files = audDt.files;

      const subDt = new DataTransfer();
      subDt.items.add(subFile);
      subtitleInput.current.files = subDt.files;

      // alert("Sample files loaded! Click 'Generate Video' to proceed.");
    } catch (error) {
      console.error("Failed to load sample files:", error);
      alert("Make sure sample.png, sample.mp3, and sample.srt exist in the /asset folder.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSampleSelection = async (event) => {
    const nextSampleFolder = event.target.value;
    setSelectedSampleFolder(nextSampleFolder);

    if (!nextSampleFolder) {
      return;
    }

    setVideoUrl(null);
    setRenderTime(null);
    setRenderMode(null);

    await loadSampleFilesForFolder(nextSampleFolder);
  };

  const handleImageSelection = (event) => {
    const nextImageFile = event.target.files?.[0];

    setVideoUrl(null);
    setRenderTime(null);
    setRenderMode(null);

    setImagePreviewUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }

      return nextImageFile ? URL.createObjectURL(nextImageFile) : null;
    });
  };

  const buildAssSubtitle = async (subtitleFile, fontName) => {
    const subtitleName = subtitleFile.name.toLowerCase();

    if (subtitleName.endsWith('.ass')) {
      return subtitleFile.text();
    }

    if (subtitleName.endsWith('.srt')) {
      return convertSrtToAssWithTransitions(subtitleFile, fontName);
      // return convertSrtToMovieCredits(subtitleFile, fontName);
    }

    const rawText = await subtitleFile.text();

    if (rawText.includes(ASS_HEADER_MARKER)) {
      return rawText;
    }
    // else
    return convertCustomTimestampToAss(rawText, fontName);
  };



  // 2. The Processing Function
  const handleProcess = async (mode) => {
    console.log('Starting Ffmpeg process...')
    if (!loaded) return;
    setIsLoading(true);
    setVideoUrl(null);
    setRenderMode(mode);
    const ffmpeg = ffmpegRef.current;

    // Read local files into FFmpeg's virtual filesystem
    const imgFile = imageInput.current.files[0];
    const audFile = audioInput.current.files[0];
    const subFile = subtitleInput.current.files[0];
    // const fntFile = fontInput.current.files[0];

    if (!imgFile || !audFile || !subFile) {
      alert("Please select an image, audio, and subtitle file.");
      setIsLoading(false);
      return;
    }

    const fontObj = BUILT_IN_FONTS.find(f => f.path === selectedFontPath);
    const assSubtitleContent = await buildAssSubtitle(subFile, fontObj.internalName);

    await ffmpeg.writeFile('input_img.png', await fetchFile(imgFile));
    await ffmpeg.writeFile('input_aud.mp3', await fetchFile(audFile));
    await ffmpeg.writeFile('input_sub.ass', assSubtitleContent);

    // Handle Custom Font Logic
    // Write a minimal fonts.conf so libass doesn't search the whole virtual OS
    const fontsConf = `<?xml version="1.0"?>
  <!DOCTYPE fontconfig SYSTEM "fonts.dtd">
  <fontconfig><dir>/</dir></fontconfig>`;
    await ffmpeg.writeFile('fonts.conf', fontsConf);

    // 3. Fetch the selected font from the public folder
    
    console.log(`Downloading font to WASM: ${fontObj.label}`);
    // Fetch from local dev server / CDN
    await ffmpeg.writeFile('active_font.ttf', await fetchFile(fontObj.path));
    const fontFilter = `ass=input_sub.ass:fontsdir=/`;

    console.log('[ffmpeg] generating....');

    const outputDurationArgs = mode === 'preview' ? ['-t', '15'] : [];
    const outputFileName = mode === 'preview' ? 'preview.mp4' : 'output.mp4';

    const timeStart = performance.now();
    // Run the conversion with highly optimized arguments
    await ffmpeg.exec([
      '-loop', '1',                   // Loop the single image
      '-framerate', '18',              // Optimization 1: Read the input image at 1 fps (saves memory)
      '-i', 'input_img.png',
      '-i', 'input_aud.mp3',
      ...outputDurationArgs,
      // Optimization 2: Scale height to 720p (-2 keeps width proportional and even-numbered) 
      // This prevents out-of-memory crashes on massive 4K phone photos
      '-filter_complex', `[0:v]scale=-2:720,${fontFilter},format=yuv420p[v]`,
      
      '-map', '[v]',                  // Map the filtered video stream
      '-map', '1:a',                  // Map the audio stream from input 1
      
      '-c:v', 'libx264',
      '-preset', 'ultrafast',         // Optimization 3: Fastest possible x264 encoding
      '-tune', 'stillimage',          // Optimization 4: Tells x264 to optimize for static backgrounds
      '-crf', '32',                   // Optimization 5: Higher CRF (lower quality) speeds up WASM rendering
      
      '-c:a', 'copy',                 // Optimization 6: Passthrough audio entirely (0 conversion time)
      
      '-shortest',                    // End video when the audio ends
      '-r', '24',                     // output frame rate of the video
      '-threads', '4',                // Optimization 8: Explicitly tell WASM to utilize multi-threading
      
      outputFileName
    ]);

    const timeEnd = performance.now();
    const secondsTaken = ((timeEnd - timeStart) / 1000).toFixed(2);
    console.log(`[ffmpeg] render taken time: ${secondsTaken}`)
    setRenderTime(secondsTaken);


    console.log('[ffmpeg] generation complete...')


    // Read the result and create a URL for the browser
    const data = await ffmpeg.readFile(outputFileName);
    setVideoUrl(URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' })));
    setIsLoading(false);
  };

  const selectedFont = BUILT_IN_FONTS.find((font) => font.path === selectedFontPath) ?? BUILT_IN_FONTS[0];

  if (!loaded) {
    return (
      <div className="studio-shell studio-shell--loading">
        <div className="studio-loader-card">
          <p className="eyebrow">Breeze</p>
          <div className="studio-shell-loader-title">
            <h2>Loading video engine</h2>
            <svg
              className="studio-loader-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="studio-loader-icon__track" cx="12" cy="12" r="9" />
              <path
                className="studio-loader-icon__arc"
                d="M21 12a9 9 0 0 0-9-9"
              />
            </svg>
          </div>
          <p>Preparing the browser encoder and subtitle engine.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="studio-shell">
      <section className="studio-topbar">
        <div className="studio-topbar__brand">
          <h1>Breeze</h1>
          <p className="eyebrow">video composer</p>
        </div>
        <div className="studio-status-card">
          <span className="status-pill">FFmpeg ready</span>
          <p className="status-value">
            {isLoading && `${renderMode === 'preview' ? 'Rendering preview' : 'Rendering full video'} ${progress}%`}
            {!isLoading && !videoUrl && `Rendering not started`}
            {!isLoading && renderTime && videoUrl && `${renderMode === 'preview' ? 'Preview' : 'Full video'} rendered in ${renderTime} seconds`}
          </p>
        </div>
      </section>

      <section className="control-panel">
        <div className="control-panel__header">
          <div className="control-panel__upload">
            <span className="eyebrow">Upload files</span>
            {/* <h2>Upload assets and choose subtitle styling</h2> */}
          </div>
          <div className="sample-controls">
            <div className="select-wrap sample-controls__select">
              <select
                className="select-input"
                value={selectedSampleFolder}
                onChange={handleSampleSelection}
                disabled={isLoading}
              >
                {SAMPLE_OPTIONS.map((sample) => (
                  <option key={sample.value} value={sample.value}>
                    {sample.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="input-stack">
          <label className="field-card">
            <div className="field-card__heading">
              <span className="field-card__label">Image</span>
              <span className="field-card__hint">JPG or PNG still used as the video background.</span>
            </div>
            <input className="file-input" type="file" accept="image/*" ref={imageInput} onChange={handleImageSelection} />
          </label>

          <label className="field-card">
            <div className="field-card__heading">
              <span className="field-card__label">Audio</span>
              <span className="field-card__hint">MP3 or supported audio source.</span>
            </div>
            <input className="file-input" type="file" accept="audio/*" ref={audioInput} />
          </label>

          <label className="field-card">
            <div className="field-card__heading">
              <span className="field-card__label">Subtitle</span>
              <span className="field-card__hint">SRT, ASS, or timestamp text files.</span>
            </div>
            <input className="file-input" type="file" accept=".srt,.ass,.txt,text/plain" ref={subtitleInput} />
          </label>

          <label className="field-card field-card--select">
            <div className="field-card__heading">
              <span className="field-card__label">Subtitle font</span>
              <span className="field-card__hint"> Choose font from list</span>
            </div>
            <div className="select-wrap">
              <select
                className="select-input"
                value={selectedFontPath}
                onChange={(e) => setSelectedFontPath(e.target.value)}
              >
                {BUILT_IN_FONTS.map((font) => (
                  <option key={font.path} value={font.path}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>

        <div className="panel-footer">
          <div className="panel-footer__actions">
            <button
              type="button"
              className="button button--secondary button--action"
              onClick={() => handleProcess('preview')}
              disabled={isLoading}
            >
              {isLoading && renderMode === 'preview' ? `Processing (${progress}%)` : 'Preview 15 seconds'}
            </button>
            <button
              type="button"
              className="button button--primary button--action"
              onClick={() => handleProcess('full')}
              disabled={isLoading}
            >
              {isLoading && renderMode === 'full' ? `Processing (${progress}%)` : 'Generate full video'}
            </button>
          </div>
        </div>
      </section>

      {(videoUrl || imagePreviewUrl) && (
        <section className="preview-panel">
          <div className="preview-panel__header">
            <div>
              <p className="eyebrow">Preview</p>
              <h2>{videoUrl ? 'Preview and download' : 'Image and subtitle style reference'}</h2>
            </div>
            {videoUrl && (
              <a className="button button--secondary" href={videoUrl} download={renderMode === 'preview' ? 'preview.mp4' : 'result.mp4'}>
                Download result
              </a>
            )}
          </div>

          {videoUrl ? (
            <video className="preview-video" controls src={videoUrl} />
          ) : (
            <div className="image-preview-stage">
              <img className="image-preview-stage__media" src={imagePreviewUrl} alt="Selected preview" />
              <div className="image-preview-stage__overlay">
                {/* <p className="image-preview-stage__eyebrow">Subtitle font preview</p> */}
                <p
                  className="image-preview-stage__caption"
                  style={{ fontFamily: `'${selectedFont.internalName}', sans-serif` }}
                >
                  Breeze subtitle sample line1
                </p>
                <p
                  className="image-preview-stage__caption"
                  style={{ fontFamily: `'${selectedFont.internalName}', sans-serif` }}
                >
                     short line2
                </p>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}