/** "Rehearse." set in the display serif; the full stop takes the colour of the sky. */
export default function Wordmark({ size }) {
  return (
    <span className="wordmark" style={size ? { fontSize: size } : undefined}>
      Rehearse<span className="wordmark-dot" aria-hidden="true">.</span>
    </span>
  );
}
