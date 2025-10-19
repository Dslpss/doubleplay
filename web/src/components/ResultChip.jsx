export default function ResultChip({ number, color }) {
  const bg = color === 'red' ? '#e74c3c' : color === 'black' ? '#2c3e50' : '#f39c12';
  const style = {
    background: bg,
    color: '#fff',
    borderRadius: 8,
    padding: '8px 12px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
  };
  return <div style={style}><strong>{number}</strong></div>;
}