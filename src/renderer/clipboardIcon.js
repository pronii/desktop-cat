// 卡通风格的剪贴板图标 SVG
function createClipboardIconSVG() {
  return `
    <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/>
        </filter>
      </defs>
      <!-- 背景圆形 -->
      <circle cx="20" cy="20" r="18" fill="#FFB6C1" filter="url(#shadow)"/>
      <!-- 剪贴板主体 -->
      <rect x="11" y="10" width="18" height="22" rx="2" fill="#FFF" stroke="#333" stroke-width="1.5"/>
      <!-- 剪贴板顶部夹子 -->
      <rect x="16" y="8" width="8" height="4" rx="2" fill="#87CEEB" stroke="#333" stroke-width="1.5"/>
      <!-- 纸张线条 -->
      <line x1="14" y1="16" x2="26" y2="16" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="14" y1="20" x2="26" y2="20" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="14" y1="24" x2="22" y2="24" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  `;
}

module.exports = { createClipboardIconSVG };
