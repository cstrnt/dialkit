import type { EasingConfig } from '../../store/DialStore';

export const easingPresets: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
};

export function EasingVisualization(props: { easing: EasingConfig }) {
  const size = 200;
  const pad = 10;
  const unit = (size - pad * 2) / 2;
  const toSvg = (x: number, y: number) => ({
    x: pad + (x + 0.5) * unit,
    y: pad + (1.5 - y) * unit,
  });
  const start = toSvg(0, 0);
  const end = toSvg(1, 1);
  const curvePath = () => {
    const [x1, y1, x2, y2] = props.easing.ease;
    const first = toSvg(x1, y1);
    const second = toSvg(x2, y2);
    return `M ${start.x} ${start.y} C ${first.x} ${first.y}, ${second.x} ${second.y}, ${end.x} ${end.y}`;
  };

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      preserveAspectRatio="xMidYMid slice"
      class="dialkit-spring-viz dialkit-easing-viz"
    >
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke="rgba(255, 255, 255, 0.15)"
        stroke-width="1"
        stroke-dasharray="4,4"
      />
      <path
        d={curvePath()}
        fill="none"
        stroke="rgba(255, 255, 255, 0.6)"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  );
}
