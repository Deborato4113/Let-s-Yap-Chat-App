export default function Ticks({ status }) {
  // status: 'sent' | 'delivered' | 'read'
  const color = status === "read" ? "var(--wa-blue-tick)" : "var(--wa-text-muted)";
  if (status === "sent") {
    return (
      <svg viewBox="0 0 16 15" width="16" height="15" fill="none">
        <path
          d="M11.071.653a.5.5 0 0 1 .706.032l.633.696a.5.5 0 0 1-.026.7L5.65 9.516a.5.5 0 0 1-.714-.013L1.62 5.842a.5.5 0 0 1 .014-.707l.7-.653a.5.5 0 0 1 .707.014l2.32 2.442L11.07.653Z"
          fill={color}
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 18 15" width="18" height="15" fill="none">
      <path
        d="M14.071.653a.5.5 0 0 1 .706.032l.633.696a.5.5 0 0 1-.026.7L8.65 9.516a.5.5 0 0 1-.714-.013L6.6 8.02l1.06-1.06 1.02 1.074 5.985-6.985.406-.396Z"
        fill={color}
      />
      <path
        d="M9.071.653a.5.5 0 0 1 .706.032l.633.696a.5.5 0 0 1-.026.7L3.65 9.516a.5.5 0 0 1-.714-.013L.02 5.842a.5.5 0 0 1 .014-.707l.7-.653a.5.5 0 0 1 .707.014l2.32 2.442L9.07.653Z"
        fill={color}
      />
    </svg>
  );
}
