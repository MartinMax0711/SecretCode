// 小狗耀耀的 SVG。表情和伤势都是分组画好的，靠 class 切换显示
import { esc } from './ui.js';

const heart = (x, y, s = 1) =>
  `M${x} ${y + 8 * s} C${x - 14 * s} ${y - 2 * s} ${x - 8 * s} ${y - 14 * s} ${x} ${y - 5 * s} C${x + 8 * s} ${y - 14 * s} ${x + 14 * s} ${y - 2 * s} ${x} ${y + 8 * s} Z`;

const spiral = (x, y) =>
  `M${x} ${y} m-2 0 a2 2 0 1 1 4 0 a5 5 0 1 1 -10 0 a8 8 0 1 1 16 0 a11 11 0 1 1 -22 0`;

const star = (x, y, r) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(x + Math.cos(rad) * rr).toFixed(1)},${(y + Math.sin(rad) * rr).toFixed(1)}`);
  }
  return pts.join(' ');
};

export function puppySvg(name) {
  const tag = esc([...name][0] || '耀');
  return `
<svg class="puppy" viewBox="0 0 300 330" role="img" aria-label="小狗${esc(name)}">
  <ellipse class="pp-shadow" cx="150" cy="318" rx="96" ry="11"/>
  <g class="pp-all">
    <g class="pp-tail">
      <path class="fur" d="M214 262 C246 262 272 238 264 204 C260 188 244 192 248 208 C252 228 236 244 210 244 Z"/>
    </g>

    <ellipse class="fur" cx="150" cy="258" rx="84" ry="62"/>
    <ellipse class="belly" cx="150" cy="274" rx="46" ry="38"/>
    <ellipse class="fur" cx="110" cy="308" rx="28" ry="16"/>
    <ellipse class="fur" cx="190" cy="308" rx="28" ry="16"/>
    <path class="line thin" d="M103 301 v8 M117 301 v8 M183 301 v8 M197 301 v8"/>

    <path class="collar" d="M84 214 Q150 250 216 214"/>
    <path class="tag" d="${heart(150, 252, 1.25)}"/>
    <text class="tag-text" x="150" y="254" text-anchor="middle" dominant-baseline="middle">${tag}</text>

    <g class="pp-head">
      <ellipse class="fur" cx="150" cy="138" rx="100" ry="86"/>
      <ellipse class="patch" cx="194" cy="126" rx="32" ry="28"/>
      <path class="line thin" d="M136 58 Q144 38 151 55 Q159 40 165 59"/>

      <path class="ear" d="M84 70 C52 62 26 96 30 142 C33 176 52 190 70 178 C84 168 82 140 96 110 Z"/>
      <path class="ear" d="M216 70 C248 62 274 96 270 142 C267 176 248 190 230 178 C216 168 218 140 204 110 Z"/>

      <g class="wrap dmg dmg-5">
        <path class="bandage" d="M56 104 Q150 66 244 104 L240 84 Q150 46 60 84 Z"/>
        <path class="line thin" d="M238 90 l22 -14 l4 14 z M238 90 l14 18 l10 -8 z"/>
      </g>

      <ellipse class="blush" cx="84" cy="172" rx="17" ry="9"/>
      <ellipse class="blush" cx="216" cy="172" rx="17" ry="9"/>

      <g class="brows">
        <path class="line thin" d="M97 110 Q110 100 123 103"/>
        <path class="line thin" d="M203 110 Q190 100 177 103"/>
      </g>

      <g class="eyes eyes-normal">
        <g class="eye"><ellipse class="ink" cx="112" cy="138" rx="12" ry="14"/><circle class="shine" cx="116" cy="132" r="4.5"/><circle class="shine" cx="108" cy="145" r="2"/></g>
        <g class="eye"><ellipse class="ink" cx="188" cy="138" rx="12" ry="14"/><circle class="shine" cx="192" cy="132" r="4.5"/><circle class="shine" cx="184" cy="145" r="2"/></g>
      </g>
      <g class="eyes eyes-hit">
        <path class="line thick" d="M100 127 L121 138 L100 149"/>
        <path class="line thick" d="M200 127 L179 138 L200 149"/>
      </g>
      <g class="eyes eyes-dizzy">
        <path class="line spiral" d="${spiral(112, 138)}"/>
        <path class="line spiral" d="${spiral(188, 138)}"/>
      </g>
      <g class="eyes eyes-plead">
        <ellipse class="ink" cx="112" cy="138" rx="16" ry="18"/><circle class="shine" cx="118" cy="130" r="6"/><circle class="shine" cx="106" cy="146" r="3"/><circle class="shine" cx="117" cy="147" r="1.8"/>
        <ellipse class="ink" cx="188" cy="138" rx="16" ry="18"/><circle class="shine" cx="194" cy="130" r="6"/><circle class="shine" cx="182" cy="146" r="3"/><circle class="shine" cx="193" cy="147" r="1.8"/>
        <path class="water" d="M97 150 Q112 162 127 150"/>
        <path class="water" d="M173 150 Q188 162 203 150"/>
      </g>
      <g class="eyes eyes-happy">
        <path class="line thick" d="M99 144 Q112 124 125 144"/>
        <path class="line thick" d="M175 144 Q188 124 201 144"/>
      </g>
      <g class="eyes eyes-love">
        <path class="love" d="${heart(112, 138, 1.3)}"/>
        <path class="love" d="${heart(188, 138, 1.3)}"/>
      </g>

      <path class="ink" d="M139 160 Q150 153 161 160 Q159 173 150 175 Q141 173 139 160 Z"/>
      <ellipse class="shine" cx="146" cy="161" rx="4" ry="2.5"/>

      <g class="mouth mouth-normal"><path class="line" d="M129 181 Q139 193 150 182 Q161 193 171 181"/></g>
      <g class="mouth mouth-hit">
        <path class="mouth-in" d="M131 186 Q150 174 169 186 Q167 214 150 216 Q133 214 131 186 Z"/>
        <ellipse class="tongue" cx="150" cy="207" rx="10" ry="6"/>
      </g>
      <g class="mouth mouth-dizzy"><path class="line" d="M127 190 q8 -9 15 0 t15 0 t15 0"/></g>
      <g class="mouth mouth-plead"><path class="line" d="M136 194 Q150 182 164 194"/></g>
      <g class="mouth mouth-happy">
        <path class="mouth-in" d="M127 182 Q150 218 173 182 Z"/>
        <ellipse class="tongue" cx="150" cy="200" rx="10" ry="6"/>
      </g>
      <g class="mouth mouth-love"><path class="line pink" d="M146 180 q12 4 0 9 q12 4 0 9"/></g>

      <g class="tears">
        <path class="tear t1" d="M98 156 q-7 13 0 19 q7 -6 0 -19"/>
        <path class="tear t2" d="M202 156 q-7 13 0 19 q7 -6 0 -19"/>
      </g>
      <path class="sweat" d="M238 80 q-9 13 0 18 q9 -5 0 -18"/>

      <g class="dmg dmg-1">
        <ellipse class="bump" cx="116" cy="58" rx="21" ry="16"/>
        <ellipse class="shine" cx="110" cy="52" rx="6" ry="3.5"/>
      </g>
      <g class="dmg dmg-3">
        <ellipse class="bump" cx="116" cy="40" rx="14" ry="11"/>
        <ellipse class="shine" cx="112" cy="36" rx="4" ry="2.5"/>
      </g>
      <g class="dmg dmg-2" transform="rotate(-18 214 186)">
        <rect class="bandage" x="190" y="177" width="48" height="18" rx="8"/>
        <rect class="pad" x="206" y="179" width="16" height="14" rx="3"/>
      </g>
      <g class="dmg dmg-4">
        <g transform="rotate(35 176 84)"><rect class="bandage" x="150" y="76" width="52" height="16" rx="7"/></g>
        <g transform="rotate(-35 176 84)"><rect class="bandage" x="150" y="76" width="52" height="16" rx="7"/></g>
        <rect class="pad" x="170" y="78" width="12" height="12" rx="2"/>
      </g>

      <g class="stars">
        <polygon class="star" points="${star(96, 44, 11)}"/>
        <polygon class="star" points="${star(150, 26, 9)}"/>
        <polygon class="star" points="${star(206, 42, 11)}"/>
      </g>
    </g>
  </g>
</svg>`;
}
