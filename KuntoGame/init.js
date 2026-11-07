(function () {
  const ENGINE_BASE = 'KuntoGame/';
  // 엔진 파일. 순서대로 불러온다 (빌드 스크립트도 이 목록을 읽는다). 문서는 API.md
  const ENGINE_FILES = [
    'math/Vector.js',
    'math/Matrix.js',
    'core/EventBus.js',
    'core/Component.js',
    'core/Transform.js',
    'core/GameObject.js',
    'core/Renderer.js',
    'ui/RectTransform.js',
    'ui/UIRoot.js',
    'ui/UIImage.js',
    'ui/UIText.js',
    'ui/UIElement.js',
    'ui/UIButton.js',
    'ui/UIRect.js',
    'ui/UIMask.js',
    'ui/UIScrollView.js',
    'systems/Time.js',
    'core/Engine.js',
    'core/Resource.js',
    'systems/Input.js',
    'components/Camera.js',
    'components/CameraFollow.js',
    'components/SpriteRenderer.js',
    'systems/RenderPipeline.js',
    'ui/UIEventSystem.js',
    'systems/Tween.js',
    'systems/Timer.js',
    'systems/Debug.js',
    'components/ParticleSystem.js',
    'components/SpriteAnimator.js',
  ];

  const GAME_BASE = 'assets/';
  const GAME_FILES = [
    'main.js',
  ];

  const bootstrap = document.createElement('script');
  const build = window.BUILD_ID && window.BUILD_ID !== '__BUILD__' ? '?v=' + window.BUILD_ID : '';
  bootstrap.src = ENGINE_BASE + 'core/Load.js' + build;

  bootstrap.onload = () => {
    Load.version = window.BUILD_ID && window.BUILD_ID !== '__BUILD__' ? window.BUILD_ID : '';
    Load.basePath = ENGINE_BASE;
    Load.Script('config.js')
      .then(() => Load.Scripts(ENGINE_FILES))
      .then(() => {
        Load.basePath = GAME_BASE;
        return Load.Scripts(GAME_FILES);
      })
      .catch((err) => {
        console.error('init.js: failed to load', err.message);
      });
  };

  bootstrap.onerror = () => {
    console.error('init.js: failed to load Load.js itself at "' + bootstrap.src + '"');
  };

  document.head.appendChild(bootstrap);
})();