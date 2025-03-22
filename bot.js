const { execSync } = require("child_process");

console.log("Selecting a random song...");
const songPath = execSync("node selectSong.js").toString().trim();

console.log("get the image from the folder...");
const selectedImages = execSync("node imageSelector.js")
  .toString()
  .trim()
  .split("\n");

console.log("Creating the video...");
execSync(`node generateVideo.js ${songPath}`);

console.log("Done! Video saved as output.mp4.");
