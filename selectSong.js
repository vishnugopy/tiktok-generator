const fs = require("fs");
const path = require("path");

function getRandomSong(folderPath) {
  const files = fs.readdirSync(folderPath);
  if (files.length === 0) throw new Error("No songs found");
  return path.join(folderPath, files[Math.floor(Math.random() * files.length)]);
}

console.log(getRandomSong("./songs"));
