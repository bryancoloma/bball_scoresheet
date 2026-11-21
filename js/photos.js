// Player photos: shrink on the device, upload to the private bucket, link to the player.
// Who may upload is decided by the database (admins and that team's coaches;
// see supabase/parents_photos.sql). This file just prepares and sends the file.
import { db, PHOTO_BUCKET } from "./data.js";

const MAX_SIDE = 900;              // px on the longest side: sharp on a card, small to upload
const JPEG_QUALITY = 0.85;
const MAX_PICKED_BYTES = 25 * 1024 * 1024; // refuse giant files before trying to open them

// Random tail for the file name, so a new photo never shows an old cached one.
function randomTail() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join(""); // 10 hex chars
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not an image")); };
    img.src = url;
  });
}

// Redraw the photo smaller as a JPEG. Redrawing also drops the hidden data
// phones attach to photos (like the GPS location where it was taken).
async function shrinkToJpeg(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("could not convert"))), "image/jpeg", JPEG_QUALITY));
}

// Throws an Error whose message is safe to show the coach.
export async function uploadPlayerPhoto(player, file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Pick a photo (JPEG, PNG or iPhone photo).");
  if (file.size > MAX_PICKED_BYTES) throw new Error("That photo is too large. Pick one under 25 MB.");

  let blob;
  try {
    blob = await shrinkToJpeg(file);
  } catch {
    throw new Error("Couldn't open that photo. Try a JPEG or PNG.");
  }

  const path = `${player.team_id}/${player.id}-${randomTail()}.jpg`;
  const up = await db.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (up.error) {
    console.error(up.error);
    throw new Error("Upload failed. Check the connection and try again.");
  }

  const { data, error } = await db.from("players").update({ photo_path: path }).eq("id", player.id).select("id");
  if (error || !data.length) {
    console.error(error);
    await db.storage.from(PHOTO_BUCKET).remove([path]); // don't leave an unused file behind
    throw new Error("Couldn't save the photo to that player.");
  }

  // The old photo isn't used anymore.
  if (player.photo_path) await db.storage.from(PHOTO_BUCKET).remove([player.photo_path]);
  return path;
}

export async function removePlayerPhoto(player) {
  const { data, error } = await db.from("players").update({ photo_path: null }).eq("id", player.id).select("id");
  if (error || !data.length) {
    console.error(error);
    throw new Error("Couldn't remove the photo.");
  }
  if (player.photo_path) await db.storage.from(PHOTO_BUCKET).remove([player.photo_path]);
}
