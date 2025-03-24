const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync } = require("child_process");
const MusicMetadata = require("music-metadata");

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

// Function to get the BPM of a song
async function getSongBPM(songPath) {
  try {
    const metadata = await MusicMetadata.parseFile(songPath);
    if (metadata.common.bpm) {
      return metadata.common.bpm;
    } else {
      console.warn("BPM not found in metadata, using default 120 BPM");
      return 120; // Default BPM if not found
    }
  } catch (error) {
    console.error("Error getting song BPM:", error.message);
    return 120; // Default BPM on error
  }
}

// Create video function with BPM effect
function createVideoWithBPMEffect(songPath, imagePath, output, bpm) {
  return new Promise(async (resolve, reject) => {
    try {
      // Get song duration to determine a valid random start time
      const songDuration = await getSongDuration(songPath);

      // Calculate a random start time, ensuring at least 60 seconds of audio remains
      const maxStartTime = Math.max(0, songDuration - 60);
      const startTime = Math.floor(Math.random() * maxStartTime);

      console.log(`Creating video using song: ${path.basename(songPath)}`);
      console.log(`Using image: ${path.basename(imagePath)}`);
      console.log(`Starting song at ${startTime} seconds (random)`);
      console.log(`BPM: ${bpm}`);

      // Calculate the beat interval in seconds
      const beatInterval = 60 / bpm;

      // Create a zoom effect that pulsates with the beat
      const zoomEffect = `zoompan=z='if(lte(mod(t,${beatInterval}),${beatInterval}/2),1+0.02*t/t,1+0.02*(t-t))':d=60`;

      ffmpeg()
        .input(imagePath)
        .inputOptions(["-loop 1", "-t 60"]) // Loop the image for 60 seconds
        .input(songPath)
        .inputOptions(`-ss ${startTime}`) // Random start time for audio
        .outputOptions([
          "-c:v libx264",
          "-pix_fmt yuv420p",
          "-t 60", // Exactly 60 seconds
          "-vf scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2",
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
          resolve();
        })
        .on("error", (err) => {
          console.error(`❌ FFmpeg Error:`, err.message);
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

    console.log("=== 9:16 Single Image Video Generator with BPM Effect ===");

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

            // Get the BPM of the song
            const bpm = await getSongBPM(song.path);

            // Select a random image
            console.log("Selecting a random image...");
            const image = getRandomFile(imagesDir, [".jpg", ".jpeg", ".png"]);
            console.log(`Selected image: ${image.filename}`);

            // Generate unique output filename
            const timestamp = new Date().getTime();
            const outputFile = path.join(outputDir, `video_${timestamp}.mp4`);

            // Create the video with the BPM effect
            await createVideoWithBPMEffect(
              song.path,
              image.path,
              outputFile,
              bpm
            );
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
