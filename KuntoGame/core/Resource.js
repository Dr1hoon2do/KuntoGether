class Resource {
  static _images = new Map();
  static _sounds = new Map();

  // image
  static setImage(key, img) {
    Resource._images.set(key, img);
    return img;
  }

  static image(key) {
    return Resource._images.get(key);
  }

  static hasImage(key) {
    return Resource._images.has(key);
  }

  // sound
  static setSound(key, sound) {
    Resource._sounds.set(key, sound);
    return sound;
  }

  static sound(key) {
    return Resource._sounds.get(key);
  }

  static hasSound(key) {
    return Resource._sounds.has(key);
  }
}