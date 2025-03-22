const fs = require("fs");
const path = require("path");

function getRandomImages(folderPath, count = 10) {
  const files = fs
    .readdirSync(folderPath)
    .filter((file) => file.endsWith(".jpg") || file.endsWith(".png"));
  if (files.length === 0) throw new Error("No images found");

  const selectedImages = [];
  for (let i = 0; i < count; i++) {
    selectedImages.push(
      path.join(folderPath, files[Math.floor(Math.random() * files.length)])
    );
  }
  return selectedImages;
}

const images = getRandomImages("./images", 10);
console.log(images.join("\n"));
