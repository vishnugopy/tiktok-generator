const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync } = require("child_process");

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Function to get random file from directory
function getRandomFile(dir, extensions) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory doesn't exist: ${dir}`);
  }

  const files = fs.readdirSync(dir).filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return extensions.includes(ext);
  });

  if (files.length === 0) {
    throw new Error(
      `No files with extensions ${extensions.join(", ")} found in ${dir}`
    );
  }

  const randomIndex = Math.floor(Math.random() * files.length);
  return {
    path: path.join(dir, files[randomIndex]),
    filename: files[randomIndex],
  };
}

// Function to get all image files from directory and shuffle them
function getShuffledImageFiles(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory doesn't exist: ${dir}`);
  }

  let imageFiles = fs
    .readdirSync(dir)
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return [".jpg", ".jpeg", ".png"].includes(ext);
    })
    .map((file) => path.join(dir, file));

  // Shuffle the array using Fisher-Yates algorithm
  for (let i = imageFiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [imageFiles[i], imageFiles[j]] = [imageFiles[j], imageFiles[i]];
  }

  return imageFiles;
}

// Create temporary directory for processed images
function createTempDir() {
  const tempDir = path.join(__dirname, "temp_images_" + Date.now());
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }
  return tempDir;
}

// Process images to fit 9:16 aspect ratio and add wiggle effect
async function processImages(imageFiles, tempDir) {
  const processedImages = [];

  console.log(
    `Processing ${imageFiles.length} images to fit 9:16 aspect ratio with effects...`
  );

  for (let i = 0; i < imageFiles.length; i++) {
    const outputImage = path.join(tempDir, `processed_${i}.jpg`);
    processedImages.push(outputImage);

    try {
      // Get song BPM (beats per minute) using ffprobe
      const bpm = await getSongBPM(songPath);

      // Calculate wiggle speed based on BPM (convert to RPM)
      const rpm = bpm / 60;

      // Different wiggle types and effects
      const wiggleTypes = [
        `scale=720:1280,setsar=1:1`,
        `scale=720*1.05:1280*1.05,setsar=1:1`, // Scale up slightly
        `scale=720*0.95:1280*0.95,setsar=1:1`, // Scale down slightly
      ];

      // Randomly select a wiggle effect
      const wiggleEffect =
        wiggleTypes[Math.floor(Math.random() * wiggleTypes.length)];

      // Process image with FFmpeg
      const command = `ffmpeg -y -loop 1 -i "${imageFiles[i]}" -t 1 -vf "${wiggleEffect}" -frames:v 30 "${outputImage}"`;

      execSync(command, { stdio: "ignore" });
      console.log(`Processed image ${i + 1}/${imageFiles.length}`);
    } catch (error) {
      console.warn(
        `Warning: Could not process image ${imageFiles[i]}. Using original.`
      );
      // If processing fails, copy original image to temp dir as fallback
      fs.copyFileSync(imageFiles[i], outputImage);
    }
  }

  return processedImages;
}

// Create video function with fixed 60 second duration and 9:16 aspect ratio
function createVideo(songPath, imageFiles, output) {
  return new Promise(async (resolve, reject) => {
    try {
      // Get song duration to determine a valid random start time
      const songDuration = await getSongDuration(songPath);

      // Calculate a random start time, ensuring at least 60 seconds of audio remains
      const maxStartTime = Math.max(0, songDuration - 60);
      const startTime = Math.floor(Math.random() * maxStartTime);

      console.log(`Creating video using song: ${path.basename(songPath)}`);
      console.log(`Using ${imageFiles.length} processed images`);
      console.log(`Starting song at ${startTime} seconds (random)`);

      // Calculate how long each image should be shown to achieve exactly 60 seconds
      const frameDuration = 60 / imageFiles.length;

      // Create temporary file list for images
      const listFilePath = path.join(__dirname, "temp_filelist.txt");
      const fileList = imageFiles
        .map((file, index) => {
          // For the last image, don't add duration (required by concat demuxer)
          if (index === imageFiles.length - 1) {
            return `file '${file.replace(/'/g, "'\\''")}'`;
          }
          return `file '${file.replace(/'/g, "'\\''")}'
duration ${frameDuration}`;
        })
        .join("\n");

      fs.writeFileSync(listFilePath, fileList);

      console.log("Image list created. Starting FFmpeg process...");

      ffmpeg()
        .input(listFilePath)
        .inputOptions(["-f concat", "-safe 0"])
        .input(songPath)
        .inputOptions(`-ss ${startTime}`) // Random start time for audio
        .outputOptions([
          "-c:v libx264",
          "-pix_fmt yuv420p",
          "-t 60", // Exactly 60 seconds
          "-map 0:v:0", // Take video from first input
          "-map 1:a:0", // Take audio from second input
          "-vf scale=720:1280,setsar=1:1",
          "-r 30", // 30 fps
        ])
        .output(output)
        .on("start", (cmd) => {
          console.log(`⚙️ FFmpeg command: ${cmd}`);
        })
        .on("progress", (progress) => {
          console.log(
            `Processing: ${
              progress.percent ? progress.percent.toFixed(1) : "?"
            }% done`
          );
        })
        .on("end", () => {
          console.log(`✅ Video created successfully: ${output}`);
          // Clean up
          if (fs.existsSync(listFilePath)) {
            fs.unlinkSync(listFilePath);
          }
          resolve();
        })
        .on("error", (err) => {
          console.error(`❌ FFmpeg Error:`, err.message);
          // Clean up even on error
          if (fs.existsSync(listFilePath)) {
            fs.unlinkSync(listFilePath);
          }
          reject(err);
        })
        .run();
    } catch (error) {
      reject(error);
    }
  });
}

// Main function
async function main() {
  try {
    // Get absolute paths
    const songsDir = path.resolve("./songs");
    const imagesDir = path.resolve("./images");
    const outputDir = path.resolve("./output");

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    console.log("=== 9:16 Random Video Generator with Effects ===");

    // Ask how many videos to generate
    rl.question(
      "How many videos would you like to generate? ",
      async (numVideos) => {
        const count = parseInt(numVideos) || 1;

        for (let i = 0; i < count; i++) {
          console.log(`\n--- Generating Video ${i + 1}/${count} ---`);
          const tempDir = createTempDir();

          try {
            // Select random song
            console.log("Selecting a random song...");
            const song = getRandomFile(songsDir, [".mp3", ".wav", ".m4a"]);
            console.log(`Selected song: ${song.filename}`);

            // Get all images from the folder and shuffle them
            console.log("Getting images from folder and shuffling...");
            const imageFiles = getShuffledImageFiles(imagesDir);
            console.log(`Found ${imageFiles.length} images`);

            if (imageFiles.length === 0) {
              throw new Error("No images found in the images directory.");
            }

            // Process images to fit 9:16 aspect ratio and add wiggle effects
            const processedImages = await processImages(imageFiles, tempDir);

            // Generate unique output filename
            const timestamp = new Date().getTime();
            const outputFile = path.join(outputDir, `video_${timestamp}.mp4`);

            // Create the video
            await createVideo(song.path, processedImages, outputFile);

            // Clean up temp directory
            cleanupTempDir(tempDir);
          } catch (error) {
            console.error(`Error generating video ${i + 1}:`, error.message);
            cleanupTempDir(tempDir);
          }
        }

        console.log("\nAll videos generated!");
        rl.close();
      }
    );
  } catch (error) {
    console.error("Fatal error:", error.message);
    rl.close();
  }
}

// Helper function to get song duration using ffprobe
function getSongDuration(songPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(songPath, (err, metadata) => {
      if (err) {
        console.warn("Couldn't determine song duration:", err.message);
        return resolve(180); // Default 3 minutes if we can't determine
      }

      if (metadata && metadata.format && metadata.format.duration) {
        resolve(metadata.format.duration);
      } else {
        console.warn("Song duration not found in metadata, using default");
        resolve(180); // Default 3 minutes
      }
    });
  });
}

// Cleanup temporary directory
function cleanupTempDir(tempDir) {
  if (fs.existsSync(tempDir)) {
    const files = fs.readdirSync(tempDir);
    files.forEach((file) => {
      fs.unlinkSync(path.join(tempDir, file));
    });
    fs.rmdirSync(tempDir);
    console.log("Cleaned up temporary files");
  }
}

// Start the program
main();
