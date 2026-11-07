const Config = {
  // 카메라 / 화면 기준 (16:9)
  viewWidth: 320,
  viewHeight: 180,
  pixelPerfect: true,

  // 스프라이트: 원본 이미지 몇 픽셀 = 월드 1유닛
  pixelsPerUnit: 1,

  // UI 배율: 'fit'(기준 해상도에 맞춤) 또는 'constant'(화면 픽셀 고정, 모바일용)
  uiScaleMode: 'constant',
  uiScale: 1,

  // 디버그 표시 (FPS, 그린 개수, 오브젝트 수 …). 실행 중에는 F3으로 켜고 끈다. 배포할 때 false
  debug: true,

  fontSize: 12,
  fontFamily: 'monospace'
};