type JokkoMarkProps = {
  size?: number;
  listening?: boolean;
  wave?: number;
  className?: string;
};

export function JokkoMark({ size = 36, listening = false, wave = 0, className = "" }: JokkoMarkProps) {
  return (
    <span
      className={`jmark${listening ? " is-listening" : ""}${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 1024 1024">
        <rect className="jmark-bg" width="1024" height="1024" rx="190" />
        <path
          className="jmark-j"
          d="M575 262 V560 C575 690 490 752 390 752 C310 752 250 715 210 655"
          pathLength={1}
        />
        <rect className="jmark-bar jmark-bar-a" x="660" y="320" width="68" height="142" rx="34" />
        <rect className="jmark-bar jmark-bar-b" x="660" y="470" width="68" height="210" rx="34" />
      </svg>
      {wave > 0 && <span key={wave} className="jmark-wave" />}
    </span>
  );
}
