const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");

// Function to check FFmpeg installation
function checkFfmpeg() {
  return new Promise((resolve, reject) => {
    ffmpeg.getAvailableFormats((err, formats) => {
      if (err) {
        reject(new Error("FFmpeg installation issue: " + err.message));
      } else {
        resolve(true);
      }
    });
  });
}

// More detailed file checking
function checkFiles(songPath, imageFolder) {
  console.log("\n=== FILE SYSTEM CHECKS ===");

  // Check song file
  try {
    const songExists = fs.existsSync(songPath);
    console.log(
      `Song file (${songPath}): ${songExists ? "✅ EXISTS" : "❌ NOT FOUND"}`
    );

    if (songExists) {
      const stats = fs.statSync(songPath);
      console.log(`- Size: ${stats.size} bytes`);
      console.log(
        `- Readable: ${fs.accessSync(songPath, fs.constants.R_OK) || "Yes"}`
      );
    }
  } catch (err) {
    console.error(`Song file error: ${err.message}`);
  }

  // Check image folder
  try {
    const folderExists = fs.existsSync(imageFolder);
    console.log(
      `Image folder (${imageFolder}): ${
        folderExists ? "✅ EXISTS" : "❌ NOT FOUND"
      }`
    );

    if (folderExists) {
      const files = fs.readdirSync(imageFolder);
      const imageFiles = files.filter(
        (f) => f.endsWith(".jpg") || f.endsWith(".png")
      );
      console.log(
        `- Contains ${imageFiles.length} image files out of ${files.length} total files`
      );

      if (imageFiles.length > 0) {
        console.log(`- First 5 images: ${imageFiles.slice(0, 5).join(", ")}`);
      }
    }
  } catch (err) {
    console.error(`Image folder error: ${err.message}`);
  }

  console.log("==========================\n");
}

// Try different FFmpeg approaches
async function createVideoWithDebug(songPath, imageFolder, output) {
  try {
    // First check FFmpeg
    await checkFfmpeg();
    console.log("✅ FFmpeg is properly installed");
  } catch (err) {
    console.error("❌ FFmpeg installation issue:", err.message);
    return;
  }

  // Check files
  checkFiles(songPath, imageFolder);

  // Get images
  const imageFiles = fs.existsSync(imageFolder)
    ? fs
        .readdirSync(imageFolder)
        .filter((f) => f.endsWith(".jpg") || f.endsWith(".png"))
        .sort()
    : [];

  if (imageFiles.length === 0) {
    console.error("❌ No image files found to process");
    return;
  }

  console.log(
    `Found ${imageFiles.length} images. Attempting 3 different methods:`
  );

  // METHOD 1: Use concat demuxer with a filelist
  try {
    console.log("\n📋 METHOD 1: Using concat demuxer with filelist");
    const listFile = path.join(__dirname, "filelist.txt");
    const fileContent = imageFiles
      .map(
        (file) =>
          `file '${path.join(imageFolder, file).replace(/'/g, "'\\''")}'`
      )
      .join("\n");

    console.log(`Creating filelist with ${imageFiles.length} entries`);
    fs.writeFileSync(listFile, fileContent);
    console.log(`Filelist created at ${listFile}`);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(listFile)
        .inputOptions(["-f concat", "-safe 0"])
        .inputFPS(1)
        .input(songPath)
        .outputOptions([
          "-c:v libx264",
          "-preset ultrafast", // Faster encoding for testing
          "-t 60",
          "-pix_fmt yuv420p",
        ])
        .output(output)
        .on("start", (cmd) => {
          console.log(`⚙️ FFmpeg command: ${cmd}`);
        })
        .on("end", () => {
          console.log("✅ Method 1 successful!");
          if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
          resolve();
        })
        .on("error", (err) => {
          console.error(`❌ Method 1 failed: ${err.message}`);
          // Try method 2
          useMethod2();
        })
        .run();
    });
  } catch (err) {
    console.error(`Method 1 setup failed: ${err.message}`);
    useMethod2();
  }

  // METHOD 2: Use glob pattern
  function useMethod2() {
    console.log("\n📋 METHOD 2: Using glob pattern");

    ffmpeg()
      .input(path.join(imageFolder, "*.jpg"))
      .inputOptions("-pattern_type glob")
      .inputFPS(1)
      .input(songPath)
      .outputOptions([
        "-c:v libx264",
        "-preset ultrafast",
        "-t 60",
        "-pix_fmt yuv420p",
      ])
      .output(output)
      .on("start", (cmd) => {
        console.log(`⚙️ FFmpeg command: ${cmd}`);
      })
      .on("end", () => {
        console.log("✅ Method 2 successful!");
      })
      .on("error", (err) => {
        console.error(`❌ Method 2 failed: ${err.message}`);
        // Try method 3
        useMethod3();
      })
      .run();
  }

  // METHOD 3: Create temporary video from each image then concatenate
  function useMethod3() {
    console.log("\n📋 METHOD 3: Create individual image videos first");

    const tempDir = path.join(__dirname, "temp_videos");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    // Create short video for each image
    const tempVideos = [];
    let completed = 0;

    for (let i = 0; i < Math.min(imageFiles.length, 10); i++) {
      const imagePath = path.join(imageFolder, imageFiles[i]);
      const tempOutput = path.join(tempDir, `temp_${i}.mp4`);
      tempVideos.push(tempOutput);

      ffmpeg()
        .input(imagePath)
        .inputOptions("-loop 1")
        .inputFPS(1)
        .outputOptions([
          "-c:v libx264",
          "-t 3", // 3 second per image
          "-pix_fmt yuv420p",
        ])
        .output(tempOutput)
        .on("end", () => {
          completed++;
          console.log(
            `Image ${i + 1}/${Math.min(imageFiles.length, 10)} processed`
          );

          if (completed === Math.min(imageFiles.length, 10)) {
            // All individual videos created, now combine them
            combineVideosWithAudio();
          }
        })
        .on("error", (err) => {
          console.error(`Error processing image ${i}: ${err.message}`);
          completed++;

          if (completed === Math.min(imageFiles.length, 10)) {
            combineVideosWithAudio();
          }
        })
        .run();
    }

    function combineVideosWithAudio() {
      const listFile = path.join(__dirname, "videolist.txt");
      const fileContent = tempVideos
        .filter((v) => fs.existsSync(v))
        .map((video) => `file '${video.replace(/'/g, "'\\''")}'`)
        .join("\n");

      if (fileContent.length === 0) {
        console.error("❌ No temporary videos were created successfully");
        return;
      }

      fs.writeFileSync(listFile, fileContent);

      ffmpeg()
        .input(listFile)
        .inputOptions(["-f concat", "-safe 0"])
        .input(songPath)
        .outputOptions(["-c:v copy", "-map 0:v:0", "-map 1:a:0", "-shortest"])
        .output(output)
        .on("start", (cmd) => {
          console.log(`⚙️ Final FFmpeg command: ${cmd}`);
        })
        .on("end", () => {
          console.log("✅ Method 3 successful!");
          // Clean up
          tempVideos.forEach((v) => {
            if (fs.existsSync(v)) fs.unlinkSync(v);
          });
          if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
          fs.rmdirSync(tempDir);
        })
        .on("error", (err) => {
          console.error(`❌ Method 3 failed: ${err.message}`);
          console.error(
            "All methods have failed. Please check your FFmpeg installation and files."
          );
        })
        .run();
    }
  }
}

// Run with absolute paths
const songPath = path.resolve("./songs/example.mp3");
const imageFolder = path.resolve("./images");
const outputPath = path.resolve("output.mp4");

console.log("=== FFmpeg Video Creation Debugging ===");
console.log(`Song path: ${songPath}`);
console.log(`Image folder: ${imageFolder}`);
console.log(`Output path: ${outputPath}`);

createVideoWithDebug(songPath, imageFolder, outputPath);
