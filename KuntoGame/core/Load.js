class Load {
  static basePath = '';
  // 파일 주소 뒤에 붙는 버전 (?v=). 배포할 때마다 바뀌어서 브라우저가 옛 파일을 캐시로 쓰지 않는다. 비어 있으면 안 붙인다
  static version = '';
  static assetBasePath = '';
  static _loaded = new Set();
  static _pending = new Map();
  static _pendingImages = new Map();

  static _versioned(url) {
    return Load.version ? url + (url.includes('?') ? '&' : '?') + 'v=' + Load.version : url;
  }

  static Script(src) {
    const full = Load._resolve(src, Load.basePath);

    if (Load._loaded.has(full)) return Promise.resolve();

    const pending = Load._pending.get(full);
    if (pending) return pending;

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = Load._versioned(full);

      script.onload = () => {
        script.remove();
        Load._loaded.add(full);
        Load._pending.delete(full);
        resolve();
      };

      script.onerror = () => {
        script.remove();
        Load._pending.delete(full);
        reject(new Error(`Load.Script: failed to load "${full}"`));
      };

      document.head.appendChild(script);
    });

    Load._pending.set(full, promise);
    return promise;
  }

  // 순서대로 불러오다가 하나라도 실패하면 바로 멈춘다 (fail-fast).
  // 계속 진행하면 엉뚱한 파일에서 'X is not defined'가 터져서 원인을 찾기 어렵다.
  static async Scripts(paths) {
    for (const path of paths) {
      try {
        await Load.Script(path);
      } catch (err) {
        console.error(err.message);
        throw err;
      }
    }
  }

  static Image(key, path) {
    if (Resource.hasImage(key)) return Promise.resolve(Resource.image(key));

    const pending = Load._pendingImages.get(key);
    if (pending) return pending;

    const full = Load._resolve(path, Load.assetBasePath);

    const promise = new Promise((resolve, reject) => {
      const img = new Image();

      const finish = () => {
        Load._pendingImages.delete(key);
        Resource.setImage(key, img);
        resolve(img);
      };

      img.onload = () => {
        if (typeof img.decode === 'function') img.decode().then(finish, finish);
        else finish();
      };

      img.onerror = () => {
        Load._pendingImages.delete(key);
        reject(new Error(`Load.Image: failed to load "${key}" from "${full}"`));
      };

      img.src = Load._versioned(full);
    });

    Load._pendingImages.set(key, promise);
    return promise;
  }

  static async Images(entries) {
    for (const [key, path] of entries) {
      try {
        await Load.Image(key, path);
      } catch (err) {
        console.error(err.message);
      }
    }
  }

  static _resolve(path, base) {
    if (!base) return path;
    if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//') || path.startsWith('/')) return path;
    const b = base.endsWith('/') ? base : base + '/';
    return b + path;
  }
}