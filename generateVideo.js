const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

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

// Function to get all image files from directory
function getAllImageFiles(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory doesn't exist: ${dir}`);
  }

  return fs
    .readdirSync(dir)
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return [".jpg", ".jpeg", ".png"].includes(ext);
    })
    .map((file) => path.join(dir, file));
}

// Create video function with fixed 60 second duration
function createVideo(songPath, imageFiles, output) {
  return new Promise(async (resolve, reject) => {
    try {
      // Get song duration to determine a valid random start time
      const songDuration = await getSongDuration(songPath);

      // Calculate a random start time, ensuring at least 60 seconds of audio remains
      const maxStartTime = Math.max(0, songDuration - 60);
      const startTime = Math.floor(Math.random() * maxStartTime);

      console.log(`Creating video using song: ${path.basename(songPath)}`);
      console.log(`Using ${imageFiles.length} images`);
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

    console.log("=== Random Video Generator ===");

    // Ask how many videos to generate
    rl.question(
      "How many videos would you like to generate? ",
      async (numVideos) => {
        const count = parseInt(numVideos) || 1;

        for (let i = 0; i < count; i++) {
          console.log(`\n--- Generating Video ${i + 1}/${count} ---`);

          try {
            // Select random song
            console.log("Selecting a random song...");
            const song = getRandomFile(songsDir, [".mp3", ".wav", ".m4a"]);
            console.log(`Selected song: ${song.filename}`);

            // Get all images from the folder
            console.log("Getting images from folder...");
            const imageFiles = getAllImageFiles(imagesDir);
            console.log(`Found ${imageFiles.length} images`);

            if (imageFiles.length === 0) {
              throw new Error("No images found in the images directory.");
            }

            // Generate unique output filename
            const timestamp = new Date().getTime();
            const outputFile = path.join(outputDir, `video_${timestamp}.mp4`);

            // Create the video
            await createVideo(song.path, imageFiles, outputFile);
          } catch (error) {
            console.error(`Error generating video ${i + 1}:`, error.message);
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

// Start the program
main();
