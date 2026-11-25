// Chat wallpapers (Settings > Chats). Each is a style applied to the message area.
export const WALLPAPERS = [
  { id: "default", label: "Default", style: null },
  { id: "plain", label: "Plain", style: { backgroundImage: "none" } },
  { id: "sand", label: "Sand", style: { backgroundImage: "none", backgroundColor: "#efe6d4" } },
  { id: "mint", label: "Mint", style: { backgroundImage: "linear-gradient(160deg,#d8f3e4,#bfe6d3)" } },
  { id: "sky", label: "Sky", style: { backgroundImage: "linear-gradient(160deg,#dbeafe,#c7d8f5)" } },
  { id: "dusk", label: "Dusk", style: { backgroundImage: "linear-gradient(160deg,#3b3355,#1f2a44)" } },
  { id: "sunset", label: "Sunset", style: { backgroundImage: "linear-gradient(160deg,#ffd9b8,#f6b3c4)" } },
  { id: "midnight", label: "Midnight", style: { backgroundImage: "none", backgroundColor: "#0b141a" } }
];

// A chat's own background is stored as one string:
//   "#rrggbb"      plain colour
//   "wp:<preset>"  one of WALLPAPERS above
//   "img:<dataURL>" a photo from the person's own device
export function chatBackgroundStyle(value, fallbackPresetId) {
  if (!value) return wallpaperStyle(fallbackPresetId);
  if (value.startsWith("img:")) {
    return {
      backgroundImage: `url("${value.slice(4)}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat"
    };
  }
  if (value.startsWith("wp:")) return wallpaperStyle(value.slice(3)) || undefined;
  return { backgroundColor: value, backgroundImage: "none" };
}

// Shrink a picked photo so it fits comfortably in browser storage.
export function compressImageFile(file, maxSide = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image."));
    };
    img.src = url;
  });
}

export function wallpaperStyle(id) {
  return WALLPAPERS.find((w) => w.id === id)?.style || undefined;
}
