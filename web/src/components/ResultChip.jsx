export default function ResultChip({ number, color, compact = false }) {
  const bg = color === 'red' ? '#e74c3c' : color === 'black' ? '#2c3e50' : '#f39c12';
  const style = {
    background: bg,
    color: '#fff',
    borderRadius: 8,
    padding: compact ? '6px 10px' : '8px 12px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: compact ? 34 : 40,
  };
  return <div style={style}><strong style={{ fontSize: compact ? 13 : 14 }}>{number}</strong></div>;
}