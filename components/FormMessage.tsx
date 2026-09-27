export default function FormMessage({ message }: { message: string | null }) {
  if (!message) return null;
  const ok = /^(Added|Saved|Login created|Password changed)/.test(message);
  return <p className={`text-sm ${ok ? "text-good" : "text-bad"}`} role="status">{message}</p>;
}
